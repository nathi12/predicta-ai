import { Suspense } from 'react';
import { getUpcomingMatches } from '@/lib/matchData';
import { MatchExplorer } from '@/components/MatchExplorer';
import { MatchGridSkeleton } from '@/components/skeletons';
import { Disclaimer } from '@/components/Disclaimer';

// Rebuilt at most every 15 minutes; served instantly from cache in between.
export const revalidate = 900;

async function MatchList() {
    const matches = await getUpcomingMatches();

    if (matches.length === 0) {
        return (
            <div className="rounded-[var(--radius-card)] border border-dashed border-border p-10 text-center text-sm text-text-dim">
                No upcoming fixtures in the next 10 days across the covered leagues.
            </div>
        );
    }

    return <MatchExplorer matches={matches} />;
}

export default function HomePage() {
    return (
        <div className="space-y-6">
            <header className="space-y-1">
                <h1 className="text-xl font-semibold tracking-tight">Upcoming fixtures</h1>
                <p className="max-w-2xl text-sm text-text-dim">
                    Match-odds, goals and both-teams-to-score probabilities from a Dixon-Coles goal
                    model blended with Elo ratings. Every prediction is logged and graded — see the{' '}
                    <a href="/accuracy" className="text-accent underline-offset-2 hover:underline">
                        accuracy record
                    </a>
                    .
                </p>
            </header>

            <Suspense fallback={<MatchGridSkeleton />}>
                <MatchList />
            </Suspense>

            <Disclaimer />
        </div>
    );
}
