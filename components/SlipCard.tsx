'use client';

import { useState } from 'react';
import type { BetSlip, Selection } from '@/lib/slip/types';
import { formatOdds, formatPct, formatSignedPct, slipToText } from '@/lib/slip/format';
import { KickoffTime } from './KickoffTime';

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
    return (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface-2 p-3">
            <div className="text-[11px] uppercase tracking-wide text-text-faint">{label}</div>
            <div className={`mt-1 text-xl font-semibold tabular ${tone ?? ''}`}>{value}</div>
            {sub && <div className="mt-0.5 text-[11px] text-text-faint">{sub}</div>}
        </div>
    );
}

function OddsCell({ leg }: { leg: Selection }) {
    if (leg.bookOdds != null) {
        const src = leg.oddsSource === 'book' ? (leg.bookmaker ?? 'book') : 'consensus';
        return (
            <span className="tabular">
                {formatOdds(leg.bookOdds)}
                <span className="ml-1 text-[10px] uppercase tracking-wide text-text-faint">{src}</span>
            </span>
        );
    }
    return (
        <span className="tabular text-text-dim">
            {formatOdds(leg.fairOdds)}
            <span className="ml-1 text-[10px] uppercase tracking-wide text-text-faint">fair</span>
        </span>
    );
}

function EdgeChip({ edge }: { edge: number | null }) {
    if (edge == null) return <span className="text-[11px] text-text-faint">—</span>;
    const tone = edge >= 0 ? 'text-pos border-pos/30' : 'text-neg border-neg/30';
    return (
        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium tabular ${tone}`}>
            {formatSignedPct(edge)}
        </span>
    );
}

export function SlipCard({ slip, heading = 'Curated slip' }: { slip: BetSlip; heading?: string }) {
    const [stake, setStake] = useState(100);
    const [copied, setCopied] = useState(false);

    const enoughLegs = slip.legs.length >= 2;
    const payoutOdds = slip.combinedBookOdds ?? slip.combinedFairOdds;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(slipToText(slip, `PredictaAI — ${heading}`));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard blocked — no-op */
        }
    };

    return (
        <div className="space-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">{heading}</h2>
                {enoughLegs && (
                    <button
                        type="button"
                        onClick={copy}
                        className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-dim transition-colors hover:border-border-strong hover:text-text"
                    >
                        {copied ? 'Copied' : 'Copy slip'}
                    </button>
                )}
            </div>

            {!enoughLegs ? (
                <div className="rounded-[var(--radius-card)] border border-dashed border-border p-8 text-center text-sm text-text-dim">
                    {slip.warnings[0] ?? 'No slip could be built from the current filters.'}
                </div>
            ) : (
                <>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <Tile
                            label={slip.combinedBookOdds != null ? 'Combined odds' : 'Fair combined odds'}
                            value={formatOdds(payoutOdds)}
                            sub={
                                slip.combinedBookOdds != null
                                    ? `${slip.legs.length} legs`
                                    : 'no live prices'
                            }
                        />
                        <Tile
                            label="Model probability"
                            value={formatPct(slip.combinedModelProbability)}
                            sub="uncalibrated · independence assumed"
                        />
                        <Tile
                            label="Edge vs odds"
                            value={
                                slip.combinedEdge != null ? formatSignedPct(slip.combinedEdge) : '—'
                            }
                            tone={
                                slip.combinedEdge == null
                                    ? undefined
                                    : slip.combinedEdge >= 0
                                      ? 'text-pos'
                                      : 'text-neg'
                            }
                        />
                        <div className="rounded-[var(--radius-card)] border border-border bg-surface-2 p-3">
                            <label className="text-[11px] uppercase tracking-wide text-text-faint">
                                Returns on
                            </label>
                            <div className="mt-1 flex items-center gap-1.5">
                                <input
                                    type="number"
                                    min={1}
                                    value={stake}
                                    onChange={(e) => setStake(Math.max(0, Number(e.target.value) || 0))}
                                    className="w-16 rounded border border-border bg-surface px-1.5 py-0.5 text-sm tabular text-text"
                                />
                                <span className="text-sm text-text-dim">→</span>
                                <span className="text-lg font-semibold tabular">
                                    {(stake * payoutOdds).toFixed(0)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <ul className="divide-y divide-border">
                        {slip.legs.map((leg) => (
                            <li key={`${leg.matchId}-${leg.market}`} className="py-2.5">
                                <div className="flex items-baseline justify-between gap-3 text-xs text-text-faint">
                                    <span className="truncate">
                                        {leg.homeTeam} v {leg.awayTeam} · {leg.leagueName}
                                    </span>
                                    <KickoffTime iso={leg.kickoff} />
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-3">
                                    <span className="truncate text-sm font-medium">{leg.pick}</span>
                                    <span className="flex shrink-0 items-center gap-2.5 text-sm">
                                        <span className="tabular text-text-dim">
                                            {formatPct(leg.modelProbability)}
                                        </span>
                                        <OddsCell leg={leg} />
                                        <EdgeChip edge={leg.edge} />
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {slip.rationale.length > 0 && (
                <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-text-faint">Why these</div>
                    <ul className="space-y-1 text-xs text-text-dim">
                        {slip.rationale.map((r) => (
                            <li key={r} className="flex gap-2">
                                <span aria-hidden className="text-text-faint">
                                    ·
                                </span>
                                <span>{r}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {slip.warnings.length > 0 && (
                <div className="rounded-[var(--radius-card)] border border-dashed border-neg/40 bg-neg/5 p-3">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-neg">Read first</div>
                    <ul className="space-y-1 text-xs text-text-dim">
                        {slip.warnings.map((w) => (
                            <li key={w} className="flex gap-2">
                                <span aria-hidden className="text-neg">
                                    ·
                                </span>
                                <span>{w}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
