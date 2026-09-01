'use client';

import { memo } from 'react';
import type { MatchWithPrediction } from '@/types';
import { ConfidencePill, DataQualityBadge, LeanChip, OutcomeBar } from './primitives';
import { KickoffTime } from './KickoffTime';
import type { SortKey } from './FilterBar';

function Crest({ src, alt }: { src?: string; alt: string }) {
    if (!src) {
        return (
            <span
                aria-hidden
                className="grid h-6 w-6 shrink-0 place-items-center rounded bg-surface-2 text-[10px] text-text-faint"
            >
                {alt.slice(0, 2).toUpperCase()}
            </span>
        );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={24} height={24} loading="lazy" className="h-6 w-6 shrink-0 object-contain" />;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

type MatchCardProps = MatchWithPrediction & {
    expanded?: boolean;
    rank?: number;
    rankMarket?: SortKey;
};

function rankReadout(p: MatchWithPrediction['prediction'], market: SortKey): string {
    switch (market) {
        case 'confidence':
            return `confidence ${p.confidence}`;
        case 'over15':
            return `Over 1.5 · ${pct(p.markets.over15.probability)}`;
        case 'over25':
            return `Over 2.5 · ${pct(p.markets.over25.probability)}`;
        case 'over35':
            return `Over 3.5 · ${pct(p.markets.over35.probability)}`;
        case 'btts':
            return `BTTS · ${pct(p.markets.btts.probability)}`;
        case 'corners95':
            return p.markets.corners ? `Corners 9.5 · ${pct(p.markets.corners.over95.probability)}` : '';
        case 'corners105':
            return p.markets.corners ? `Corners 10.5 · ${pct(p.markets.corners.over105.probability)}` : '';
        default:
            return '';
    }
}

export const MatchCard = memo(function MatchCard({
    match,
    prediction,
    expanded = false,
    rank,
    rankMarket,
}: MatchCardProps) {
    const { home, away } = match;
    const g = prediction.markets;
    const topRank = rank != null && rank <= 3;

    return (
        <article className="flex flex-col rounded-[var(--radius-card)] border border-border bg-surface p-4">
            {rank != null && (
                <div className="mb-2 flex items-center gap-2">
                    <span
                        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular ${
                            topRank
                                ? 'border-accent/50 bg-accent/10 text-accent'
                                : 'border-border bg-surface-2 text-text-dim'
                        }`}
                    >
                        #{rank}
                    </span>
                    {rankMarket && (
                        <span className="text-xs text-text-faint tabular">
                            {rankReadout(prediction, rankMarket)}
                        </span>
                    )}
                </div>
            )}

            <div className="flex items-center justify-between text-xs text-text-faint">
                <span>{match.leagueName}</span>
                <KickoffTime iso={match.kickoff} />
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Crest src={home.team.crest} alt={home.team.tla || home.team.shortName} />
                    <span className="truncate text-sm font-medium">{home.team.shortName}</span>
                </div>
                <div className="text-center tabular">
                    <div className="text-lg font-semibold leading-none">
                        {prediction.predictedScore.home}–{prediction.predictedScore.away}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-text-faint">proj.</div>
                </div>
                <div className="flex items-center justify-end gap-2 min-w-0">
                    <span className="truncate text-right text-sm font-medium">{away.team.shortName}</span>
                    <Crest src={away.team.crest} alt={away.team.tla || away.team.shortName} />
                </div>
            </div>

            <div className="mt-3">
                <OutcomeBar
                    outcome={prediction.outcome}
                    homeLabel={home.team.shortName}
                    awayLabel={away.team.shortName}
                />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <ConfidencePill value={prediction.confidence} />
                <DataQualityBadge quality={prediction.dataQuality} />
                <span className="text-xs text-text-dim tabular">
                    xG {prediction.expectedGoals.home.toFixed(1)}–{prediction.expectedGoals.away.toFixed(1)}
                </span>
            </div>

            {/* `open` follows the global "show all markets" toggle; an individual
                click persists until that toggle next changes (React only writes
                the attribute when `expanded` actually changes between renders). */}
            <details className="group mt-3 border-t border-border pt-3" open={expanded}>
                <summary className="cursor-pointer list-none text-xs font-medium text-text-dim hover:text-text">
                    Markets &amp; reasoning
                </summary>

                <div className="mt-3 space-y-1.5 text-sm">
                    <Row
                        label="Over 1.5 goals"
                        value={pct(g.over15.probability)}
                        lean={g.over15.lean}
                        highlight={rankMarket === 'over15'}
                    />
                    <Row
                        label="Over 2.5 goals"
                        value={pct(g.over25.probability)}
                        lean={g.over25.lean}
                        highlight={rankMarket === 'over25'}
                    />
                    <Row
                        label="Over 3.5 goals"
                        value={pct(g.over35.probability)}
                        lean={g.over35.lean}
                        highlight={rankMarket === 'over35'}
                    />
                    <Row
                        label="Both teams score"
                        value={pct(g.btts.probability)}
                        lean={g.btts.lean}
                        highlight={rankMarket === 'btts'}
                    />
                    {g.corners && (
                        <>
                            <Row
                                label="Over 9.5 corners"
                                value={pct(g.corners.over95.probability)}
                                lean={g.corners.over95.lean}
                                muted
                                highlight={rankMarket === 'corners95'}
                            />
                            <Row
                                label="Over 10.5 corners"
                                value={pct(g.corners.over105.probability)}
                                lean={g.corners.over105.lean}
                                muted
                                highlight={rankMarket === 'corners105'}
                            />
                            <p className="pt-0.5 text-[11px] text-text-faint">
                                ~{g.corners.expected.toFixed(1)} expected ·{' '}
                                {g.corners.source === 'team-rates'
                                    ? 'from both sides’ corner history'
                                    : 'proxy from expected goals'}
                            </p>
                        </>
                    )}
                </div>

                {prediction.drivers.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-text-dim">
                        {prediction.drivers.map((d) => (
                            <li key={d} className="flex gap-2">
                                <span aria-hidden className="text-text-faint">
                                    ·
                                </span>
                                <span>{d}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </details>
        </article>
    );
});

function Row({
    label,
    value,
    lean,
    muted,
    highlight,
}: {
    label: string;
    value: string;
    lean: 'over' | 'under' | 'yes' | 'no' | null;
    muted?: boolean;
    highlight?: boolean;
}) {
    return (
        <div
            className={`flex items-center justify-between gap-3 ${
                highlight ? '-mx-2 rounded bg-accent/10 px-2 py-1' : ''
            }`}
        >
            <span className={highlight ? 'font-medium text-text' : muted ? 'text-text-faint' : 'text-text-dim'}>
                {label}
            </span>
            <span className="flex items-center gap-2">
                <LeanChip lean={lean} />
                <span className={`w-10 text-right tabular ${highlight ? 'font-semibold text-text' : 'font-medium'}`}>
                    {value}
                </span>
            </span>
        </div>
    );
}
