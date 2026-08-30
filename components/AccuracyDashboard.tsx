import type { GradedResult, RollingStats, TrackedPrediction } from '@/types';
import { LEAGUES } from '@/lib/leagues';

const rate = (hits: number, n: number) => (n > 0 ? hits / n : 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function AccuracyDashboard({
    stats,
    recent,
}: {
    stats: RollingStats | null;
    recent: Array<GradedResult & { tracked: TrackedPrediction | null }>;
}) {
    if (!stats || stats.outcome.n === 0) {
        return (
            <div className="rounded-[var(--radius-card)] border border-dashed border-border p-10 text-center text-sm text-text-dim">
                No graded predictions yet. Results are scored automatically a few hours after each
                match finishes — check back once this week’s fixtures have played.
            </div>
        );
    }

    const o = stats.outcome;
    const brier = o.n > 0 ? o.brier / o.n : 0;

    return (
        <div className="space-y-8">
            <section className="grid gap-3 sm:grid-cols-3">
                <Stat label="Graded predictions" value={String(o.n)} />
                <Stat label="Match-outcome hit rate" value={pct(rate(o.hits, o.n))} sub="vs ~53–56% ceiling" />
                <Stat label="1X2 Brier score" value={brier.toFixed(3)} sub="lower is better · 0.63 = coin toss" />
            </section>

            <section>
                <h2 className="mb-2 text-sm font-semibold">By market</h2>
                <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-text-faint">
                        <tr>
                            <th className="py-1.5">Market</th>
                            <th className="py-1.5 text-right">Sample</th>
                            <th className="py-1.5 text-right">Hit rate</th>
                        </tr>
                    </thead>
                    <tbody className="tabular">
                        <MarketRow label="Match outcome (1X2)" n={o.n} hits={o.hits} />
                        <MarketRow label="Over/Under 2.5 goals" n={stats.over25.n} hits={stats.over25.hits} />
                        <MarketRow label="Both teams to score" n={stats.btts.n} hits={stats.btts.hits} />
                    </tbody>
                </table>
            </section>

            <section>
                <h2 className="mb-2 text-sm font-semibold">Calibration — favourite probability vs actual</h2>
                <p className="mb-3 text-xs text-text-dim">
                    A well-calibrated model’s bars sit on the diagonal: when it says 60%, it’s right
                    about 60% of the time.
                </p>
                <CalibrationChart bins={stats.calibration} />
            </section>

            <section>
                <h2 className="mb-2 text-sm font-semibold">By league</h2>
                <table className="w-full text-sm">
                    <tbody className="tabular">
                        {Object.entries(stats.byLeague).map(([code, s]) =>
                            s && s.n > 0 ? (
                                <tr key={code} className="border-t border-border">
                                    <td className="py-1.5">{LEAGUES[code as keyof typeof LEAGUES]?.name ?? code}</td>
                                    <td className="py-1.5 text-right text-text-dim">{s.n}</td>
                                    <td className="py-1.5 text-right">{pct(rate(s.hits, s.n))}</td>
                                </tr>
                            ) : null,
                        )}
                    </tbody>
                </table>
            </section>

            {recent.length > 0 && (
                <section>
                    <h2 className="mb-2 text-sm font-semibold">Recent results</h2>
                    <ul className="divide-y divide-border text-sm">
                        {recent.map((r) => (
                            <li key={r.matchId} className="flex items-center justify-between gap-3 py-2">
                                <span className="truncate text-text-dim">
                                    {r.tracked ? `${r.tracked.home} v ${r.tracked.away}` : r.matchId}
                                </span>
                                <span className="flex items-center gap-3 tabular">
                                    <span>
                                        {r.finalScore.home}–{r.finalScore.away}
                                    </span>
                                    <span
                                        className={
                                            r.hits.outcome ? 'text-pos' : 'text-neg'
                                        }
                                        title="Match-outcome pick"
                                    >
                                        {r.hits.outcome ? 'hit' : 'miss'}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <div className="text-xs text-text-faint">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular">{value}</div>
            {sub && <div className="mt-0.5 text-xs text-text-faint">{sub}</div>}
        </div>
    );
}

function MarketRow({ label, n, hits }: { label: string; n: number; hits: number }) {
    return (
        <tr className="border-t border-border">
            <td className="py-1.5">{label}</td>
            <td className="py-1.5 text-right text-text-dim">{n}</td>
            <td className="py-1.5 text-right">{n > 0 ? pct(hits / n) : '—'}</td>
        </tr>
    );
}

function CalibrationChart({ bins }: { bins: RollingStats['calibration'] }) {
    const width = 320;
    const height = 200;
    const pad = 28;
    const scale = (v: number) => ({
        x: pad + v * (width - 2 * pad),
        y: height - pad - v * (height - 2 * pad),
    });

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="max-w-sm"
            role="img"
            aria-label="Calibration chart: predicted probability against observed frequency"
        >
            <line
                x1={pad}
                y1={height - pad}
                x2={width - pad}
                y2={pad}
                stroke="var(--color-border-strong)"
                strokeDasharray="4 3"
            />
            <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="var(--color-border)" />
            <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="var(--color-border)" />
            {bins.map((b) => {
                if (b.n === 0) return null;
                const predicted = b.predicted / b.n;
                const actual = b.actual / b.n;
                const p = scale(predicted);
                const a = scale(actual);
                return (
                    <g key={b.bin}>
                        <line x1={p.x} y1={p.y} x2={p.x} y2={a.y} stroke="var(--color-border-strong)" />
                        <circle cx={p.x} cy={a.y} r={Math.min(6, 2 + b.n / 8)} fill="var(--color-accent)" />
                    </g>
                );
            })}
        </svg>
    );
}
