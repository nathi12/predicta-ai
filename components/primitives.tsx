import type { DataQuality, OutcomeProbabilities } from '@/types';
import { leagueByCode } from '@/lib/leagues';
import { confidenceBand, pct, PROB_BANDS, probBand } from '@/lib/fixtures/view';

const CREST_BOX = {
    20: 'h-5 w-5 text-[9px]',
    24: 'h-6 w-6 text-[10px]',
    40: 'h-10 w-10 text-xs',
} as const;

/** Team crest, or the team's initials when there is no image. Decorative: the name is always beside it. */
export function Crest({ src, fallback, size = 20 }: { src?: string; fallback: string; size?: 20 | 24 | 40 }) {
    const box = CREST_BOX[size];
    if (!src) {
        return (
            <span
                aria-hidden
                className={`grid shrink-0 place-items-center rounded bg-surface-2 font-medium text-text-faint ${box}`}
            >
                {fallback.slice(0, 3).toUpperCase()}
            </span>
        );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} loading="lazy" className={`shrink-0 object-contain ${box}`} />;
}

/**
 * A probability: the printed number (text tokens) over a thin meter whose
 * length is the probability and whose shade is its band. The number always
 * carries the value, so the colour is never the only channel.
 */
export function ProbValue({
    p,
    srLabel,
    tone = 'normal',
    size = 'sm',
    className = '',
}: {
    p: number;
    /** Read before the number by screen readers when no visible label sits next to it. */
    srLabel?: string;
    tone?: 'strong' | 'normal' | 'muted';
    size?: 'sm' | 'lg';
    className?: string;
}) {
    const text =
        tone === 'strong'
            ? 'font-semibold text-text'
            : tone === 'muted'
              ? 'font-medium text-text-dim'
              : 'font-medium text-text';
    return (
        <span className={`flex min-w-0 flex-col ${className}`}>
            <span className={`tabular leading-none ${size === 'lg' ? 'text-2xl' : 'text-sm'} ${text}`}>
                {srLabel && <span className="sr-only">{srLabel}: </span>}
                {pct(p)}
            </span>
            <span
                aria-hidden
                className={`block w-full overflow-hidden rounded-full bg-border ${size === 'lg' ? 'mt-2.5 h-1' : 'mt-1.5 h-[3px]'}`}
            >
                <span
                    className="block h-full rounded-full"
                    style={{
                        width: `${Math.min(1, Math.max(0, p)) * 100}%`,
                        background: `var(--color-prob-${probBand(p)})`,
                    }}
                />
            </span>
        </span>
    );
}

/** Key for the probability-band shades. */
export function ProbLegend({ className = '' }: { className?: string }) {
    return (
        <p
            className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-text-faint ${className}`}
            title="Bar shade shows how likely the model rates it — not a guarantee"
        >
            <span>
                Probability % <span className="sr-only">— bar shade marks the band, not a guarantee:</span>
            </span>
            {PROB_BANDS.map((b) => (
                <span key={b.band} className="inline-flex items-center gap-1 tabular">
                    <span
                        aria-hidden
                        className="h-1 w-3 rounded-full"
                        style={{ background: `var(--color-prob-${b.band})` }}
                    />
                    {b.label}
                </span>
            ))}
        </p>
    );
}

const METER_HEIGHTS = ['h-1.5', 'h-2.5', 'h-3.5'] as const;

/**
 * Model confidence (0-100) as a neutral three-step meter plus its band name.
 * Deliberately not green/amber: confidence is how sharp and well-backed the
 * forecast is, not a promise about the result.
 */
export function ConfidenceMeter({
    value,
    showLabel = true,
    showValue = false,
}: {
    value: number;
    showLabel?: boolean;
    /** Print the 0-100 score after the band name. */
    showValue?: boolean;
}) {
    const { level, label } = confidenceBand(value);
    return (
        <span
            className="inline-flex items-center gap-1.5"
            title={`Model confidence ${value}/100 — forecast sharpness × data quality`}
        >
            <span aria-hidden className="inline-flex items-end gap-[2px]">
                {METER_HEIGHTS.map((h, i) => (
                    <span
                        key={h}
                        className={`w-[3px] rounded-sm ${h} ${i < level ? 'bg-text-dim' : 'bg-border-strong'}`}
                    />
                ))}
            </span>
            {showLabel && (
                <span aria-hidden className="text-xs text-text-dim">
                    {label}
                    {showValue && <span className="tabular font-semibold text-text"> {value}</span>}
                </span>
            )}
            <span className="sr-only">
                {label} confidence, {value} of 100
            </span>
        </span>
    );
}

export function DataQualityBadge({ quality }: { quality: DataQuality }) {
    if (quality === 'enriched') {
        return (
            <span
                className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent"
                title="Includes live form + provider signals from API-Football"
            >
                Enriched
            </span>
        );
    }
    return (
        <span
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-text-faint"
            title="Built from league tables, home/away splits and form only"
        >
            Core data
        </span>
    );
}

const LEAN_LABEL = { over: 'Over', under: 'Under', yes: 'Yes', no: 'No' } as const;

/** The model's lean on a line. Neutral on purpose — "under" is not a bad outcome. */
export function LeanChip({ lean }: { lean: 'over' | 'under' | 'yes' | 'no' | null }) {
    if (!lean) return <span className="text-xs text-text-faint">No lean</span>;
    return (
        <span className="rounded border border-border-strong px-1.5 py-0.5 text-[11px] font-medium text-text-dim">
            {LEAN_LABEL[lean]}
        </span>
    );
}

const FORM_TONE = {
    W: 'bg-pos/15 text-pos',
    D: 'bg-surface-2 text-text-dim',
    L: 'bg-neg/15 text-neg',
} as const;
const FORM_WORD = { W: 'win', D: 'draw', L: 'loss' } as const;

/** Recent results, oldest to newest left to right. Each square carries its letter. */
export function FormGuide({
    form,
    team,
    size = 'md',
}: {
    form: Array<'W' | 'D' | 'L'>;
    team: string;
    size?: 'sm' | 'md';
}) {
    const box = size === 'sm' ? 'h-4 w-4 text-[9px]' : 'h-5 w-5 text-[10px]';
    if (form.length === 0) return <span className="text-xs text-text-faint">No recent results</span>;
    const chronological = [...form].reverse();
    return (
        <span
            role="img"
            aria-label={`${team} last ${form.length}, oldest to newest: ${chronological
                .map((r) => FORM_WORD[r])
                .join(', ')}`}
            className="inline-flex gap-0.5"
        >
            {chronological.map((r, i) => (
                <span
                    key={i}
                    aria-hidden
                    className={`grid place-items-center rounded font-semibold ${box} ${FORM_TONE[r]}`}
                >
                    {r}
                </span>
            ))}
        </span>
    );
}

/** Compact league tag; the full name is in the tooltip and for screen readers. */
export function LeagueTag({ code, name }: { code: string; name: string }) {
    return (
        <span
            title={name}
            className="inline-flex items-center rounded border border-border px-1 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-text-dim"
        >
            <span aria-hidden>{leagueByCode(code)?.abbr ?? code}</span>
            <span className="sr-only">{name}</span>
        </span>
    );
}

/** Stacked home / draw / away bar; segments split by a 2px gap. */
export function OutcomeBar({
    outcome,
    homeLabel,
    awayLabel,
}: {
    outcome: OutcomeProbabilities;
    homeLabel: string;
    awayLabel: string;
}) {
    const seg = [
        { key: 'home', value: outcome.home, color: 'var(--color-home)' },
        { key: 'draw', value: outcome.draw, color: 'var(--color-draw)' },
        { key: 'away', value: outcome.away, color: 'var(--color-away)' },
    ];
    return (
        <div
            className="flex h-2 w-full gap-[2px]"
            role="img"
            aria-label={`Win probability — ${homeLabel} ${pct(outcome.home)}, draw ${pct(outcome.draw)}, ${awayLabel} ${pct(outcome.away)}`}
        >
            {seg.map((s) => (
                <div
                    key={s.key}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{ flexGrow: s.value, flexBasis: 0, background: s.color }}
                />
            ))}
        </div>
    );
}
