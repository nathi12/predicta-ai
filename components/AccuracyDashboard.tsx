import type {
    GradedResult,
    GradedSlip,
    RollingStats,
    SlipRecord,
    SlipRollingStats,
    TrackedPrediction,
} from '@/types';
import { LEAGUES } from '@/lib/leagues';
import { SLIP_PRESET_LABEL } from '@/lib/slip/types';
import {
    buildCalibrationMap,
    buildCornerCalibrationMap,
    CALIBRATION_MIN_TOTAL,
    CORNERS_CALIBRATION_MIN_TOTAL,
} from '@/lib/prediction/calibrate';

const rate = (hits: number, n: number) => (n > 0 ? hits / n : 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const signedPct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

export function AccuracyDashboard({
    stats,
    recent,
    slipStats,
    slipsRecent,
}: {
    stats: RollingStats | null;
    recent: Array<GradedResult & { tracked: TrackedPrediction | null }>;
    slipStats: SlipRollingStats | null;
    slipsRecent: Array<GradedSlip & { record: SlipRecord | null }>;
}) {
    return (
        <div className="space-y-12">
            <PredictionRecord stats={stats} recent={recent} />
            <SlipRecord stats={slipStats} recent={slipsRecent} />
        </div>
    );
}

function PredictionRecord({
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
                        <MarketRow label="Over/Under 1.5 goals" n={stats.over15?.n ?? 0} hits={stats.over15?.hits ?? 0} />
                        <MarketRow label="Over/Under 2.5 goals" n={stats.over25.n} hits={stats.over25.hits} />
                        <MarketRow label="Both teams to score" n={stats.btts.n} hits={stats.btts.hits} />
                        <MarketRow label="Over 9.5 corners" n={stats.corners95?.n ?? 0} hits={stats.corners95?.hits ?? 0} />
                        <MarketRow label="Over 10.5 corners" n={stats.corners105?.n ?? 0} hits={stats.corners105?.hits ?? 0} />
                    </tbody>
                </table>
                {(stats.corners95?.n ?? 0) === 0 && (
                    <p className="mt-2 text-xs text-text-faint">
                        Corners are graded off API-Football match stats and only for fixtures
                        matched to it before kickoff — the sample builds from zero and lags the
                        goals markets.
                    </p>
                )}
            </section>

            <section>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">Calibration — favourite probability vs actual</h2>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-text-faint">
                        Market: match outcome (1X2)
                    </span>
                </div>
                <p className="mb-3 text-xs text-text-dim">
                    A well-calibrated model’s bars sit on the diagonal: when it says 60%, it’s right
                    about 60% of the time.
                </p>
                <CalibrationChart bins={stats.calibration} market="Match outcome (1X2)" />
                <CalibrationStatus stats={stats} />
            </section>

            {stats.cornersCalibration && (
                <section>
                    <h2 className="mb-2 text-sm font-semibold">Calibration — corners over/under</h2>
                    <p className="mb-3 text-xs text-text-dim">
                        Same read for the corner totals: each dot is a bucket of over-probabilities
                        against how often the over actually landed.
                    </p>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <figure>
                            <figcaption className="mb-1 text-xs text-text-faint">Over 9.5 corners</figcaption>
                            <CalibrationChart bins={stats.cornersCalibration.over95} market="Over 9.5 corners" />
                        </figure>
                        <figure>
                            <figcaption className="mb-1 text-xs text-text-faint">Over 10.5 corners</figcaption>
                            <CalibrationChart bins={stats.cornersCalibration.over105} market="Over 10.5 corners" />
                        </figure>
                    </div>
                    <CornersCalibrationStatus stats={stats} />
                </section>
            )}

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
                                        className={r.hits.outcome ? 'text-pos' : 'text-neg'}
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

function SlipRecord({
    stats,
    recent,
}: {
    stats: SlipRollingStats | null;
    recent: Array<GradedSlip & { record: SlipRecord | null }>;
}) {
    const o = stats?.overall;
    const graded = o?.n ?? 0;

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">Bet-slip record</h2>
                <p className="max-w-2xl text-sm text-text-dim">
                    The builder’s canonical preset slips are logged when they’re shown and settled at
                    1 unit each once every leg has played. Corners legs are never in these — the
                    corner model is a proxy we don’t stake.
                </p>
            </div>

            {graded === 0 || !o ? (
                <div className="rounded-[var(--radius-card)] border border-dashed border-border p-8 text-center text-sm text-text-dim">
                    No graded slips yet.
                </div>
            ) : (
                <>
                    <section className="grid gap-3 sm:grid-cols-3">
                        <Stat label="Graded slips" value={String(o.n)} />
                        <Stat label="Slips landed" value={pct(rate(o.won, o.n))} sub={`${o.won} of ${o.n}`} />
                        <Stat
                            label="Return on stake"
                            value={o.staked > 0 ? signedPct(o.returned / o.staked - 1) : '—'}
                            sub="1 unit per slip"
                        />
                    </section>

                    <section>
                        <h3 className="mb-2 text-sm font-semibold">By preset</h3>
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs uppercase tracking-wide text-text-faint">
                                <tr>
                                    <th className="py-1.5">Preset</th>
                                    <th className="py-1.5 text-right">Slips</th>
                                    <th className="py-1.5 text-right">Landed</th>
                                    <th className="py-1.5 text-right">ROI</th>
                                </tr>
                            </thead>
                            <tbody className="tabular">
                                {Object.entries(stats.byPreset).map(([id, s]) => (
                                    <tr key={id} className="border-t border-border">
                                        <td className="py-1.5">{SLIP_PRESET_LABEL[id] ?? id}</td>
                                        <td className="py-1.5 text-right text-text-dim">{s.n}</td>
                                        <td className="py-1.5 text-right">{pct(rate(s.won, s.n))}</td>
                                        <td
                                            className={`py-1.5 text-right ${
                                                s.staked > 0 && s.returned / s.staked - 1 >= 0
                                                    ? 'text-pos'
                                                    : 'text-neg'
                                            }`}
                                        >
                                            {s.staked > 0 ? signedPct(s.returned / s.staked - 1) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                    {recent.length > 0 && (
                        <section>
                            <h3 className="mb-2 text-sm font-semibold">Recent slips</h3>
                            <ul className="divide-y divide-border text-sm">
                                {recent.map((r) => (
                                    <li key={r.slipId} className="py-2.5">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="truncate font-medium text-text-dim">
                                                {SLIP_PRESET_LABEL[r.presetId] ?? r.presetId} ·{' '}
                                                {r.legResults.length} legs
                                            </span>
                                            <span className="flex shrink-0 items-center gap-3 tabular">
                                                {r.combinedBookOdds != null && (
                                                    <span className="text-text-faint">
                                                        @ {r.combinedBookOdds.toFixed(2)}
                                                    </span>
                                                )}
                                                <span
                                                    className={r.won ? 'text-pos' : 'text-neg'}
                                                >
                                                    {r.won ? 'landed' : 'lost'}
                                                </span>
                                            </span>
                                        </div>
                                        <ul className="mt-1.5 space-y-1 border-l border-border pl-3">
                                            {r.legResults.map((leg, i) => {
                                                const recLeg = r.record?.legs[i];
                                                const home = leg.home ?? recLeg?.home;
                                                const away = leg.away ?? recLeg?.away;
                                                return (
                                                    <li
                                                        key={`${leg.matchId}-${i}`}
                                                        className="flex items-center justify-between gap-3 text-xs"
                                                    >
                                                        <span className="min-w-0 truncate text-text-faint">
                                                            <span className="text-text-dim">
                                                                {leg.pick}
                                                            </span>
                                                            {home && away && (
                                                                <>
                                                                    {' · '}
                                                                    {home} v {away}
                                                                </>
                                                            )}
                                                        </span>
                                                        <span className="flex shrink-0 items-center gap-2 tabular">
                                                            {leg.score && (
                                                                <span className="text-text-faint">
                                                                    {leg.score.home}–{leg.score.away}
                                                                </span>
                                                            )}
                                                            <span
                                                                className={
                                                                    leg.hit ? 'text-pos' : 'text-neg'
                                                                }
                                                                title={leg.hit ? 'leg hit' : 'leg missed'}
                                                            >
                                                                {leg.hit ? 'hit' : 'miss'}
                                                            </span>
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </>
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

/** Whether the learned recalibration curve is currently feeding back into the model. */
function CalibrationStatus({ stats }: { stats: RollingStats }) {
    const graded = stats.calibration.reduce((s, b) => s + b.n, 0);
    const live = buildCalibrationMap(stats.calibration) !== undefined;

    return (
        <p className="mt-3 text-xs text-text-faint">
            {live ? (
                <>
                    <span className="text-pos">● Recalibration live</span> — outcome probabilities
                    are corrected against this curve, relearned from all {graded} graded predictions
                    on every rebuild.
                </>
            ) : (
                <>
                    <span className="text-text-dim">○ Running uncalibrated</span> — the model uses
                    raw probabilities until {CALIBRATION_MIN_TOTAL} predictions are graded ({graded}/
                    {CALIBRATION_MIN_TOTAL} so far).
                </>
            )}
        </p>
    );
}

/** Whether the corners recalibration curve is currently feeding back into the model. */
function CornersCalibrationStatus({ stats }: { stats: RollingStats }) {
    const c = stats.cornersCalibration;
    const graded =
        c.over95.reduce((s, b) => s + b.n, 0) + c.over105.reduce((s, b) => s + b.n, 0);
    const live = buildCornerCalibrationMap(c.over95, c.over105) !== undefined;

    return (
        <p className="mt-3 text-xs text-text-faint">
            {live ? (
                <>
                    <span className="text-pos">● Recalibration live</span> — corner over/under
                    probabilities are corrected against these curves, relearned from all {graded}{' '}
                    graded corner lines on every rebuild.
                </>
            ) : (
                <>
                    <span className="text-text-dim">○ Running uncalibrated</span> — raw model
                    probabilities until {CORNERS_CALIBRATION_MIN_TOTAL} corner lines are graded (
                    {graded}/{CORNERS_CALIBRATION_MIN_TOTAL} so far).
                </>
            )}
        </p>
    );
}

function CalibrationChart({ bins, market }: { bins: RollingStats['calibration']; market?: string }) {
    const width = 400;
    const height = 260;
    const m = { top: market ? 28 : 12, right: 16, bottom: 40, left: 44 };
    const x0 = m.left;
    const y0 = height - m.bottom;
    const x1 = width - m.right;
    const y1 = m.top;
    const midX = (x0 + x1) / 2;
    const midY = (y0 + y1) / 2;
    const scale = (v: number) => ({
        x: x0 + v * (x1 - x0),
        y: y0 + v * (y1 - y0),
    });

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full max-w-md"
            role="img"
            aria-label={`Calibration chart${market ? ` for ${market}` : ''}: predicted probability against observed frequency`}
        >
            {market && (
                <text
                    x={x0}
                    y={16}
                    textAnchor="start"
                    fill="var(--color-text-dim)"
                    fontSize={12}
                    fontWeight={600}
                >
                    {market}
                </text>
            )}
            <line
                x1={x0}
                y1={y0}
                x2={x1}
                y2={y1}
                stroke="var(--color-border-strong)"
                strokeDasharray="4 3"
            />
            <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="var(--color-border)" />
            <line x1={x0} y1={y1} x2={x0} y2={y0} stroke="var(--color-border)" />
            <text
                x={midX}
                y={height - 8}
                textAnchor="middle"
                fill="var(--color-text-faint)"
                fontSize={11}
            >
                predictions
            </text>
            <text
                x={14}
                y={midY}
                textAnchor="middle"
                fill="var(--color-text-faint)"
                fontSize={11}
                transform={`rotate(-90 14 ${midY})`}
            >
                actuals
            </text>
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
