import type { Metadata } from 'next';
import { getRollingStats, recentResults, type StatsView } from '@/lib/tracking';
import { getSlipStats, recentSlips } from '@/lib/slipTracking';
import { AccuracyDashboard } from '@/components/AccuracyDashboard';

export const metadata: Metadata = {
    title: 'Accuracy record',
    description: 'How PredictaAI’s published predictions have performed against real results.',
};

export const dynamic = 'force-dynamic';

const parseView = (v: string | undefined): StatsView => (v === '90d' || v === 'model' ? v : 'all');

export default async function AccuracyPage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string }>;
}) {
    const view = parseView((await searchParams).view);
    const [allTime, current, windowed, recent, slipStats, slipsRecent] = await Promise.all([
        getRollingStats('all'),
        getRollingStats('model'),
        view === '90d' ? getRollingStats('90d') : Promise.resolve(null),
        recentResults(20),
        getSlipStats(),
        recentSlips(12),
    ]);
    const stats = view === 'all' ? allTime : view === 'model' ? current : windowed;

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
                view={view}
                stats={stats}
                allTime={allTime}
                current={current}
                recent={recent}
                slipStats={slipStats}
                slipsRecent={slipsRecent}
            />
        </div>
    );
}
