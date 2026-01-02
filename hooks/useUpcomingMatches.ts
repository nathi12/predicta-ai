import { useEffect, useState } from 'react';
import { fetchAllUpcomingMatches } from '@/services/sportsApi';
import { Match } from '@/types';

export function useUpcomingMatches() {
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadMatches = async () => {
        try {
            setLoading(true);
            const { footballMatches } = await fetchAllUpcomingMatches();
            setMatches([...footballMatches]);
            setError(null);
        } catch (err) {
            setError('Failed to load matches');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMatches();
    }, []);

    const refetch = async () => {
        await loadMatches();
    };

    return { matches, loading, error, refetch };
}
