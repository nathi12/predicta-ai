import type { DataQuality, OutcomeProbabilities } from '@/types';

const pctText = (p: number) => `${Math.round(p * 100)}%`;

/** Stacked home / draw / away bar. Favourite label is emphasised. */
export function OutcomeBar({
    outcome,
    homeLabel,
    awayLabel,
}: {
    outcome: OutcomeProbabilities;
    homeLabel: string;
    awayLabel: string;
}) {
    const fav = (['home', 'draw', 'away'] as const).reduce((a, b) =>
        outcome[a] >= outcome[b] ? a : b,
    );
    const seg = [
        { key: 'home' as const, label: homeLabel, value: outcome.home, color: 'var(--color-home)' },
        { key: 'draw' as const, label: 'Draw', value: outcome.draw, color: 'var(--color-draw)' },
        { key: 'away' as const, label: awayLabel, value: outcome.away, color: 'var(--color-away)' },
    ];
    return (
        <div>
            <div
                className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2"
                role="img"
                aria-label={`Win probability — ${homeLabel} ${pctText(outcome.home)}, draw ${pctText(
                    outcome.draw,
                )}, ${awayLabel} ${pctText(outcome.away)}`}
            >
                {seg.map((s) => (
                    <div key={s.key} style={{ width: `${s.value * 100}%`, background: s.color }} />
                ))}
            </div>
            <div className="mt-1.5 flex justify-between text-xs tabular">
                {seg.map((s) => (
                    <span
                        key={s.key}
                        className={s.key === fav ? 'font-semibold text-text' : 'text-text-dim'}
                    >
                        {s.key === 'draw' ? 'X' : s.key === 'home' ? '1' : '2'} {pctText(s.value)}
                    </span>
                ))}
            </div>
        </div>
    );
}

export function ConfidencePill({ value }: { value: number }) {
    const band = value >= 70 ? 'High' : value >= 50 ? 'Medium' : 'Low';
    const tone =
        value >= 70
            ? 'text-pos border-pos/30 bg-pos/10'
            : value >= 50
              ? 'text-neutral border-neutral/30 bg-neutral/10'
              : 'text-text-dim border-border bg-surface-2';
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${tone}`}
            title={`Model confidence ${value}/100`}
        >
            {band} confidence · {value}
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

export function LeanChip({ lean }: { lean: 'over' | 'under' | 'yes' | 'no' | null }) {
    if (!lean) return <span className="text-xs text-text-faint">no lean</span>;
    const label = lean.toUpperCase();
    const tone =
        lean === 'over' || lean === 'yes'
            ? 'text-pos border-pos/30'
            : 'text-neg border-neg/30';
    return (
        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>
    );
}
