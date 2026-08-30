'use client';

import type { LeagueCode } from '@/types';
import { SegGroup } from './FilterBar';
import {
    MARKET_META,
    RISK_PRESETS,
    SINGLE_MARKET_CHOICES,
    type RiskPreset,
    type SlipDateBucket,
    type SlipMarket,
    type SlipMode,
    type SlipRequest,
} from '@/lib/slip/types';

const MARKET_SHORT: Record<SlipMarket, string> = Object.fromEntries(
    MARKET_META.map((m) => [m.id, m.short]),
) as Record<SlipMarket, string>;

const DATE_OPTIONS: { value: SlipDateBucket; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'tomorrow', label: 'Tomorrow' },
    { value: '3d', label: 'Next 3 days' },
    { value: 'week', label: 'This week' },
];

const PROB_OPTIONS = [0.5, 0.55, 0.6, 0.65, 0.7].map((v) => ({
    value: String(v),
    label: `${Math.round(v * 100)}%`,
}));

function Stepper({
    legend,
    value,
    min,
    max,
    step,
    format,
    onChange,
}: {
    legend: string;
    value: number;
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
    onChange: (v: number) => void;
}) {
    const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
    return (
        <fieldset className="min-w-0">
            <legend className="mb-1.5 text-[11px] uppercase tracking-wide text-text-faint">
                {legend}
            </legend>
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    aria-label={`Decrease ${legend}`}
                    disabled={value <= min}
                    onClick={() => onChange(clamp(value - step))}
                    className="rounded-md border border-border bg-surface px-2.5 py-1 text-sm text-text-dim transition-colors hover:border-border-strong hover:text-text disabled:opacity-40"
                >
                    −
                </button>
                <span className="w-14 text-center text-sm tabular font-medium">{format(value)}</span>
                <button
                    type="button"
                    aria-label={`Increase ${legend}`}
                    disabled={value >= max}
                    onClick={() => onChange(clamp(value + step))}
                    className="rounded-md border border-border bg-surface px-2.5 py-1 text-sm text-text-dim transition-colors hover:border-border-strong hover:text-text disabled:opacity-40"
                >
                    +
                </button>
            </div>
        </fieldset>
    );
}

export function SlipControls({
    req,
    leagues,
    onChange,
}: {
    req: SlipRequest;
    leagues: { code: string; name: string }[];
    onChange: (next: SlipRequest) => void;
}) {
    const set = (patch: Partial<SlipRequest>) => onChange({ ...req, ...patch });

    return (
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-3">
            <SegGroup<SlipMode>
                legend="Build"
                value={req.mode}
                options={[
                    { value: 'target-odds', label: 'Target odds' },
                    { value: 'single-market', label: 'One market' },
                ]}
                onChange={(mode) => set({ mode })}
            />

            <SegGroup<RiskPreset>
                legend="Risk"
                value={req.risk}
                options={[
                    { value: 'safe', label: 'Safe' },
                    { value: 'balanced', label: 'Balanced' },
                    { value: 'value', label: 'Value' },
                ]}
                onChange={(risk) => set({ risk, minProbability: RISK_PRESETS[risk].minProbability })}
            />

            {req.mode === 'target-odds' ? (
                <>
                    <Stepper
                        legend="Target odds"
                        value={req.targetOdds}
                        min={1.25}
                        max={15}
                        step={0.25}
                        format={(v) => v.toFixed(2)}
                        onChange={(targetOdds) => set({ targetOdds })}
                    />
                    <Stepper
                        legend="Max legs"
                        value={req.maxLegs}
                        min={2}
                        max={6}
                        step={1}
                        format={(v) => String(v)}
                        onChange={(maxLegs) => set({ maxLegs })}
                    />
                </>
            ) : (
                <>
                    <SegGroup<SlipMarket>
                        legend="Market"
                        value={req.market}
                        options={SINGLE_MARKET_CHOICES.map((m) => ({ value: m, label: MARKET_SHORT[m] }))}
                        onChange={(market) => set({ market })}
                    />
                    <Stepper
                        legend="Legs"
                        value={req.legs}
                        min={2}
                        max={8}
                        step={1}
                        format={(v) => String(v)}
                        onChange={(legs) => set({ legs })}
                    />
                </>
            )}

            <fieldset className="min-w-0">
                <legend className="mb-1.5 text-[11px] uppercase tracking-wide text-text-faint">
                    League
                </legend>
                <select
                    value={req.leagues === 'all' ? 'all' : (req.leagues[0] ?? 'all')}
                    onChange={(e) =>
                        set({
                            leagues:
                                e.target.value === 'all' ? 'all' : [e.target.value as LeagueCode],
                        })
                    }
                    className="rounded-md border border-border bg-surface px-2.5 py-1 text-sm text-text"
                >
                    <option value="all">All leagues</option>
                    {leagues.map((l) => (
                        <option key={l.code} value={l.code}>
                            {l.name}
                        </option>
                    ))}
                </select>
            </fieldset>

            <SegGroup<SlipDateBucket>
                legend="When"
                value={req.dateBucket}
                options={DATE_OPTIONS}
                onChange={(dateBucket) => set({ dateBucket })}
            />

            <SegGroup<string>
                legend="Min leg probability"
                value={String(req.minProbability)}
                options={PROB_OPTIONS}
                onChange={(v) => set({ minProbability: Number(v) })}
            />
        </div>
    );
}
