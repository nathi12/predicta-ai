import type { HeadToHead as H2H } from '@/types';
import { pct } from '@/lib/fixtures/view';

export function HeadToHead({ h2h, home, away }: { h2h: H2H; home: string; away: string }) {
    const stats = [
        { label: `${home} wins`, value: h2h.homeWins },
        { label: 'Draws', value: h2h.draws },
        { label: `${away} wins`, value: h2h.awayWins },
        { label: 'Goals per game', value: h2h.avgGoals.toFixed(1) },
        { label: 'Both scored', value: pct(h2h.bttsRate) },
    ];
    return (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {stats.map((s) => (
                <div key={s.label} className="min-w-0 rounded-[var(--radius-card)] border border-border bg-surface-2 p-3">
                    <dt className="truncate text-[11px] uppercase tracking-wide text-text-faint">{s.label}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular">{s.value}</dd>
                </div>
            ))}
        </dl>
    );
}
