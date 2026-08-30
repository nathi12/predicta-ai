import type { Metadata } from 'next';
import { getRollingStats, recentResults } from '@/lib/tracking';
import { getSlipStats, recentSlips } from '@/lib/slipTracking';
import { AccuracyDashboard } from '@/components/AccuracyDashboard';

export const metadata: Metadata = {
    title: 'Accuracy record',
    description: 'How PredictaAI’s published predictions have performed against real results.',
};

export const dynamic = 'force-dynamic';

export default async function AccuracyPage() {
    const [stats, recent, slipStats, slipsRecent] = await Promise.all([
        getRollingStats(),
        recentResults(20),
        getSlipStats(),
        recentSlips(12),
    ]);

    return (
        <div className="space-y-6">
            <header className="space-y-1">
                <h1 className="text-xl font-semibold tracking-tight">Accuracy record</h1>
                <p className="max-w-2xl text-sm text-text-dim">
                    Every prediction shown on the site is stored when it’s made and scored
                    automatically once the match finishes. Nothing here is back-fitted.
                </p>
            </header>

            <AccuracyDashboard
                stats={stats}
                recent={recent}
                slipStats={slipStats}
                slipsRecent={slipsRecent}
            />
        </div>
    );
}
