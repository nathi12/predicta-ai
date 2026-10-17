'use client';

import { memo } from 'react';
import Link from 'next/link';
import type { FixtureSummary } from '@/lib/fixtures/summary';
import {
    favouriteOutcome,
    focusColumn,
    MARKET_LABEL,
    MARKET_SHORT,
    marketProbability,
    type SortKey,
} from '@/lib/fixtures/view';
import { ConfidenceMeter, Crest, LeagueTag, ProbValue } from './primitives';
import { KickoffTime } from './KickoffTime';

// Tailwind needs the full class names in source.
const STRIP_AREA = {
    px: 'lg:[grid-area:px]',
    o25: 'lg:[grid-area:o25]',
    btts: 'lg:[grid-area:btts]',
    focus: 'lg:[grid-area:focus]',
} as const;

/** A draw / market cell: labelled on phones, a bare column under the header on lg. */
function StripCell({
    area,
    label,
    srLabel,
    p,
    tone = 'normal',
}: {
    area: keyof typeof STRIP_AREA;
    label: string;
    srLabel: string;
    p: number | null;
    tone?: 'strong' | 'normal' | 'muted';
}) {
    return (
        <div className={`min-w-0 ${STRIP_AREA[area]}`}>
            <span aria-hidden className="mb-1 block text-[11px] text-text-faint lg:hidden">
                {label}
            </span>
            {p == null ? (
                <span className="text-sm text-text-faint">
                    —<span className="sr-only">{srLabel}: not modelled</span>
                </span>
            ) : (
                <ProbValue p={p} srLabel={srLabel} tone={tone} className="w-14" />
            )}
        </div>
    );
}

/**
 * One fixture. The whole row is the link to the match page (a stretched link
 * on the home name), so it stays a single tab stop.
 */
export const MatchRow = memo(function MatchRow({
    fixture: f,
    sort,
    rank,
}: {
    fixture: FixtureSummary;
    sort: SortKey;
    rank?: number;
}) {
    const focus = focusColumn(sort);
    const fav = favouriteOutcome(f.outcome);
    const side = (k: 'home' | 'draw' | 'away') => (fav === k ? 'strong' : 'muted');

    return (
        <article className="match-row relative px-3 py-3 transition-colors hover:bg-surface-2 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-[-2px] has-[a:focus-visible]:outline-accent max-lg:rounded-[var(--radius-card)] max-lg:border max-lg:border-border max-lg:bg-surface lg:py-2.5">
            <div className="flex min-w-0 items-center gap-2 [grid-area:when] lg:flex-col lg:items-start lg:gap-1">
                {rank != null && (
                    <span className="text-xs font-semibold text-text tabular">#{rank}</span>
                )}
                <span className="text-sm font-medium text-text tabular">
                    <KickoffTime iso={f.kickoff} format={rank != null ? 'dayTime' : 'time'} />
                </span>
                <LeagueTag code={f.league} name={f.leagueName} />
            </div>

            <div className="flex min-w-0 items-center gap-2 [grid-area:home]">
                <Crest src={f.home.crest} fallback={f.home.tla || f.home.name} />
                <Link
                    href={`/match/${encodeURIComponent(f.id)}`}
                    prefetch={false}
                    aria-label={`${f.home.name} v ${f.away.name} — match analysis`}
                    className="truncate text-sm font-medium text-text after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                >
                    {f.home.name}
                </Link>
            </div>
            <ProbValue
                p={f.outcome.home}
                srLabel={`${f.home.name} win`}
                tone={side('home')}
                className="w-14 [grid-area:p1]"
            />

            <div className="flex min-w-0 items-center gap-2 [grid-area:away]">
                <Crest src={f.away.crest} fallback={f.away.tla || f.away.name} />
                <span className="truncate text-sm font-medium text-text">{f.away.name}</span>
            </div>
            <ProbValue
                p={f.outcome.away}
                srLabel={`${f.away.name} win`}
                tone={side('away')}
                className="w-14 [grid-area:p2]"
            />

            <div className="match-strip">
                <StripCell area="px" label="Draw" srLabel="Draw" p={f.outcome.draw} tone={side('draw')} />
                <StripCell
                    area="o25"
                    label="O2.5"
                    srLabel="Over 2.5 goals"
                    p={f.markets.over25}
                    tone={focus === 'o25' ? 'strong' : 'normal'}
                />
                <StripCell
                    area="btts"
                    label="BTTS"
                    srLabel="Both teams score"
                    p={f.markets.btts}
                    tone={focus === 'btts' ? 'strong' : 'normal'}
                />
                {focus === 'extra' && (
                    <StripCell
                        area="focus"
                        label={MARKET_SHORT[sort]}
                        srLabel={MARKET_LABEL[sort]}
                        p={marketProbability(f, sort)}
                        tone="strong"
                    />
                )}
            </div>

            <div className="justify-self-end [grid-area:conf] lg:justify-self-start">
                <ConfidenceMeter value={f.confidence} showValue={focus === 'conf'} />
            </div>

            <span aria-hidden className="hidden text-text-faint lg:block lg:[grid-area:go]">
                ›
            </span>
        </article>
    );
});
