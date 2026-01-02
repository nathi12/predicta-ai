// API Utility Functions for Rate Limiting and Error Handling

/**
 * Delay helper function
 */
export const delay = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry function with exponential backoff for 429 errors
 */
export async function fetchWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3
): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            // Check if it's a 429 error
            if (error.response?.status === 429 && i < maxRetries - 1) {
                const waitTime = Math.pow(2, i) * 1000; // 1s, 2s, 4s
                console.log(`Rate limited. Retrying in ${waitTime}ms...`);
                await delay(waitTime);
                continue;
            }
            throw error;
        }
    }
    throw new Error('Max retries reached');
}

/**
 * Process items in batches with delays between batches
 */
export async function processBatches<T, R>(
    items: T[],
    processFn: (item: T) => Promise<R>,
    batchSize: number = 3,
    delayBetweenBatches: number = 1000
): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);

        // Process batch in parallel
        const batchResults = await Promise.all(
            batch.map(item => processFn(item))
        );

        results.push(...batchResults);

        // Wait between batches (except for the last batch)
        if (i + batchSize < items.length) {
            await delay(delayBetweenBatches);
        }
    }

    return results;
}

/**
 * Simple in-memory cache
 */
class SimpleCache<T> {
    private cache = new Map<string, { data: T; timestamp: number }>();
    private ttl: number;

    constructor(ttlMinutes: number = 5) {
        this.ttl = ttlMinutes * 60 * 1000;
    }

    get(key: string): T | null {
        const cached = this.cache.get(key);
        if (!cached) return null;

        // Check if expired
        if (Date.now() - cached.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    set(key: string, data: T): void {
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    clear(): void {
        this.cache.clear();
    }
}

export const teamStatsCache = new SimpleCache(5); // 5 minute cache