import { Suspense } from 'react';
import { after } from 'next/server';
import type { Metadata } from 'next';
import { getUpcomingMatches } from '@/lib/matchData';
import { getUpcomingOdds } from '@/lib/oddsData';
import { recordPresetSlips } from '@/lib/slipTracking';
import { SlipBuilder } from '@/components/SlipBuilder';
import { MatchGridSkeleton } from '@/components/skeletons';
import { Disclaimer } from '@/components/Disclaimer';

export const metadata: Metadata = {
    title: 'Bet-slip builder',
    description:
        'Turn the model’s probabilities into a curated accumulator: target a combined odds figure or build one market, priced against real bookmaker odds.',
};

// Served from cache; ISR revalidates in the background every 15 minutes.
export const revalidate = 900;
// Headroom for the detached cache rebuild kicked off by getUpcomingMatches().
export const maxDuration = 60;

async function Builder() {
    const [matches, odds] = await Promise.all([getUpcomingMatches(), getUpcomingOdds()]);

    // After the response: log the canonical preset slips for the public record.
    after(() => recordPresetSlips(matches, odds).catch(() => {}));

    if (matches.length === 0) {
        return (
            <div className="rounded-[var(--radius-card)] border border-dashed border-border p-10 text-center text-sm text-text-dim">
                No upcoming fixtures in range across the covered leagues.
            </div>
        );
    }

    return <SlipBuilder matches={matches} odds={odds} />;
}

export default function SlipPage() {
    return (
        <div className="space-y-6">
            <header className="space-y-1">
                <h1 className="text-xl font-semibold tracking-tight">Bet-slip builder</h1>
                <p className="max-w-2xl text-sm text-text-dim">
                    Pick a target combined odds figure, or build the whole slip from one market. The
                    model ranks every selection; the curator assembles the safest set that fits, one
                    leg per match, priced against real bookmaker odds where available. The curated
                    preset slips are logged and graded on the{' '}
                    <a href="/accuracy" className="text-accent underline-offset-2 hover:underline">
                        accuracy record
                    </a>
                    .
                </p>
            </header>

            <Suspense fallback={<MatchGridSkeleton />}>
                <Builder />
            </Suspense>

            <Disclaimer />
        </div>
    );
}
