import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMatchById } from '@/lib/matchData';
import { pct } from '@/lib/fixtures/view';
import { MatchHero } from '@/components/match/MatchHero';
import { MarketsTable } from '@/components/match/MarketsTable';
import { ScorelineList } from '@/components/match/ScorelineList';
import { TeamComparison } from '@/components/match/TeamComparison';
import { HeadToHead } from '@/components/match/HeadToHead';
import { Section } from '@/components/match/Section';
import { Disclaimer } from '@/components/Disclaimer';

// Same cadence as the fixtures list it is read from.
export const revalidate = 900;
// Headroom for the detached cache rebuild kicked off by getUpcomingMatches().
export const maxDuration = 60;

/** Nothing prerendered at build time: each match page renders on first visit, then ISR. */
export async function generateStaticParams() {
    return [];
}

type Props = { params: Promise<{ id: string }> };

/** `${leagueCode}-${footballDataId}` — reject anything else before touching the store. */
const MATCH_ID = /^[A-Z0-9]{2,4}-\d{1,9}$/;

async function load(params: Props['params']) {
    const { id } = await params;
    return MATCH_ID.test(id) ? getMatchById(id) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const m = await load(params);
    if (!m) return { title: 'Fixture not found' };
    const h = m.match.home.team.shortName;
    const a = m.match.away.team.shortName;
    const o = m.prediction.outcome;
    return {
        title: `${h} v ${a} prediction`,
        description:
            `${m.match.leagueName}: ${h} ${pct(o.home)}, draw ${pct(o.draw)}, ${a} ${pct(o.away)}. ` +
            'Goals, both-teams-to-score and corners probabilities, form and the model’s reasoning.',
    };
}

export default async function MatchPage({ params }: Props) {
    const m = await load(params);
    if (!m) notFound();

    const { match, prediction } = m;
    const home = match.home.team.shortName;
    const away = match.away.team.shortName;
    const hasH2h = !!match.h2h && match.h2h.matches > 0;

    const sections = [
        { id: 'markets', label: 'Markets' },
        { id: 'scorelines', label: 'Scorelines' },
        { id: 'teams', label: 'Teams' },
        ...(hasH2h ? [{ id: 'h2h', label: 'Head-to-head' }] : []),
        { id: 'why', label: 'Why' },
    ];

    return (
        <div className="space-y-6">
            <Link href="/" className="inline-block text-sm text-text-dim hover:text-text">
                <span aria-hidden>←</span> All fixtures
            </Link>

            <MatchHero match={match} prediction={prediction} />

            <nav aria-label="On this page" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <ul className="flex gap-1">
                    {sections.map((s) => (
                        <li key={s.id} className="shrink-0">
                            <a
                                href={`#${s.id}`}
                                className="block whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1 text-sm text-text-dim transition-colors hover:border-border-strong hover:text-text"
                            >
                                {s.label}
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <Section id="markets" title="Markets">
                    <MarketsTable markets={prediction.markets} />
                </Section>
                <Section
                    id="scorelines"
                    title="Likely scorelines"
                    description="Exact scores from the same goal model as every market."
                >
                    <ScorelineList scorelines={prediction.topScorelines} home={home} away={away} />
                </Section>
            </div>

            <Section
                id="teams"
                title="Team comparison"
                description="Season numbers from the league table; the venue rows compare each side at this fixture’s venue."
            >
                <TeamComparison home={match.home} away={match.away} />
            </Section>

            {hasH2h && match.h2h && (
                <Section
                    id="h2h"
                    title="Head-to-head"
                    description={`Last ${match.h2h.matches} meetings between these sides.`}
                >
                    <HeadToHead h2h={match.h2h} home={home} away={away} />
                </Section>
            )}

            <Section id="why" title="Why the model leans this way">
                {prediction.drivers.length > 0 ? (
                    <ul className="space-y-1.5 text-sm text-text-dim">
                        {prediction.drivers.map((d) => (
                            <li key={d} className="flex gap-2">
                                <span aria-hidden className="text-text-faint">
                                    ·
                                </span>
                                <span>{d}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-text-faint">No standout factors — the inputs are evenly balanced.</p>
                )}
                <p className="mt-4 text-xs text-text-faint">
                    Probabilities, not guarantees. See{' '}
                    <Link href="/method" className="text-accent underline-offset-2 hover:underline">
                        how the model works
                    </Link>{' '}
                    and its{' '}
                    <Link href="/accuracy" className="text-accent underline-offset-2 hover:underline">
                        graded track record
                    </Link>
                    .
                </p>
            </Section>

            <Disclaimer />
        </div>
    );
}
