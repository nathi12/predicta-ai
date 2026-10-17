import Link from 'next/link';
import type {
    GradedResult,
    GradedSlip,
    MarketKey,
    MarketStat,
    RollingStats,
    SlipRecord,
    SlipRollingStats,
    TrackedPrediction,
    VsMarketStat,
} from '@/types';
import type { StatsView } from '@/lib/tracking';
import { LEAGUES } from '@/lib/leagues';
import { meanScores } from '@/lib/grading';
import { MODEL_VERSION } from '@/lib/prediction';
import { SLIP_PRESET_LABEL } from '@/lib/slip/types';
import {
    CALIBRATION_MIN_TOTAL,
    CORNERS_CALIBRATION_MIN_TOTAL,
    cornersCalibrationFromStats,
    outcomeCalibrationFromStats,
    type CalibrationSource,
} from '@/lib/prediction/calibrate';

const rate = (hits: number, n: number) => (n > 0 ? hits / n : 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const signedPct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

const VIEWS: Array<{ id: StatsView; label: string }> = [
    { id: 'all', label: 'All time' },
    { id: '90d', label: 'Last 90 days' },
    { id: 'model', label: `Model v${MODEL_VERSION}` },
];

const EMPTY_VIEW: Record<StatsView, string> = {
    all: 'No graded predictions yet. Results are scored automatically a few hours after each match finishes — check back once this week’s fixtures have played.',
    '90d': 'Nothing with a kickoff in the last 90 days has been graded yet.',
    model: `Nothing graded for model v${MODEL_VERSION} yet — its record starts with its first finished match.`,
};

const MARKET_LABEL: Record<MarketKey, string> = {
    outcome: 'Match outcome (1X2)',
    over15: 'Over/Under 1.5 goals',
    over25: 'Over/Under 2.5 goals',
    over35: 'Over/Under 3.5 goals',
    btts: 'Both teams to score',
};

export function AccuracyDashboard({
    view,
    stats,
    allTime,
    current,
    recent,
    slipStats,
    slipsRecent,
}: {
    view: StatsView;
    /** The aggregate for the selected view. */
    stats: RollingStats | null;
    /** All-time and live-model aggregates — what the live calibration curves come from. */
    allTime: RollingStats | null;
    current: RollingStats | null;
    recent: Array<GradedResult & { tracked: TrackedPrediction | null }>;
    slipStats: SlipRollingStats | null;
    slipsRecent: Array<GradedSlip & { record: SlipRecord | null }>;
}) {
    return (
        <div className="space-y-12">
            <div className="space-y-6">
                <ViewTabs view={view} />
                <PredictionRecord
                    view={view}
                    stats={stats}
                    allTime={allTime}
                    current={current}
                    recent={recent}
                />
            </div>
            <SlipRecord stats={slipStats} recent={slipsRecent} />
        </div>
    );
}

function ViewTabs({ view }: { view: StatsView }) {
    return (
        <nav aria-label="Record view" className="flex flex-wrap gap-1.5">
            {VIEWS.map((v) => (
                <Link
                    key={v.id}
                    href={v.id === 'all' ? '/accuracy' : `/accuracy?view=${v.id}`}
                    aria-current={v.id === view ? 'page' : undefined}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        v.id === view
                            ? 'border-accent/50 bg-accent/10 text-accent'
                            : 'border-border text-text-dim hover:border-border-strong hover:text-text'
                    }`}
                >
                    {v.label}
                </Link>
            ))}
        </nav>
    );
}

function PredictionRecord({
    view,
    stats,
    allTime,
    current,
    recent,
}: {
    view: StatsView;
    stats: RollingStats | null;
    allTime: RollingStats | null;
    current: RollingStats | null;
    recent: Array<GradedResult & { tracked: TrackedPrediction | null }>;
}) {
    if (!stats || stats.outcome.n === 0) {
        return (
            <div className="rounded-[var(--radius-card)] border border-dashed border-border p-10 text-center text-sm text-text-dim">
                {EMPTY_VIEW[view]}
            </div>
        );
    }

    const o = stats.outcome;
    const brier = o.n > 0 ? o.brier / o.n : 0;
    const calibrationBase = allTime ?? stats;

    return (
        <div className="space-y-8">
            <section className="grid gap-3 sm:grid-cols-3">
                <Stat label="Graded predictions" value={String(o.n)} />
                <Stat label="Match-outcome hit rate" value={pct(rate(o.hits, o.n))} sub="vs ~53–56% ceiling" />
                <Stat label="1X2 Brier score" value={brier.toFixed(3)} sub="lower is better · 0.667 = no skill (⅓ each)" />
            </section>

            <section>
                <h2 className="mb-2 text-sm font-semibold">By market</h2>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[28rem] text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-text-faint">
                            <tr>
                                <th className="py-1.5">Market</th>
                                <th className="py-1.5 text-right">Sample</th>
                                <th className="py-1.5 text-right">Hit rate</th>
                                <th className="py-1.5 text-right">Brier</th>
                                <th className="py-1.5 text-right">Log loss</th>
                            </tr>
                        </thead>
                        <tbody className="tabular">
                            <MarketRow label={MARKET_LABEL.outcome} stat={o} />
                            <MarketRow label={MARKET_LABEL.over15} stat={stats.over15} />
                            <MarketRow label={MARKET_LABEL.over25} stat={stats.over25} />
                            <MarketRow label={MARKET_LABEL.over35} stat={stats.over35} />
                            <MarketRow label={MARKET_LABEL.btts} stat={stats.btts} />
                            <MarketRow label="Over 9.5 corners" stat={stats.corners95} />
                            <MarketRow label="Over 10.5 corners" stat={stats.corners105} />
                        </tbody>
                    </table>
                </div>
                <p className="mt-2 text-xs text-text-faint">
                    Hit rate only asks which side of 50% a forecast fell; Brier and log loss score the
                    probability itself — lower is better. A coin flip scores 0.250 and 0.693 (a ⅓
                    each 1X2 forecast: 0.667 and 1.099). Blank where results predate these scores.
                </p>
                {(stats.corners95?.n ?? 0) === 0 && (
                    <p className="mt-2 text-xs text-text-faint">
                        Corners are graded off API-Football match stats and only for fixtures
                        matched to it before kickoff — the sample builds from zero and lags the
                        goals markets.
                    </p>
                )}
            </section>

            <MarketComparison vs={stats.vsMarket} />

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
                <CalibrationStatus allTime={calibrationBase} current={current} />
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
                    <CornersCalibrationStatus allTime={calibrationBase} current={current} />
                </section>
            )}

            <section>
                <h2 className="mb-2 text-sm font-semibold">By league</h2>
                <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-text-faint">
                        <tr>
                            <th className="py-1.5">League</th>
                            <th className="py-1.5 text-right">Sample</th>
                            <th className="py-1.5 text-right">1X2 hit rate</th>
                            <th className="py-1.5 text-right">1X2 log loss</th>
                        </tr>
                    </thead>
                    <tbody className="tabular">
                        {Object.entries(stats.byLeague).map(([code, s]) =>
                            s && s.n > 0 ? (
                                <tr key={code} className="border-t border-border">
                                    <td className="py-1.5">{LEAGUES[code as keyof typeof LEAGUES]?.name ?? code}</td>
                                    <td className="py-1.5 text-right text-text-dim">{s.n}</td>
                                    <td className="py-1.5 text-right">{pct(rate(s.hits, s.n))}</td>
                                    <td className="py-1.5 text-right">{meanScores(s)?.logLoss.toFixed(3) ?? '—'}</td>
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
                    Each of the builder’s canonical preset slips is logged once a day, built only
                    from selections with live bookmaker prices, and settled at 1 unit at those prices
                    once every leg has played. Corners legs are never in these — the corner model is
                    a proxy we don’t stake.
                </p>
                <p className="max-w-2xl text-xs text-text-faint">
                    Record restarted in October 2026 after a method fix: earlier slips were logged on
                    every page view and some were settled at fair odds, which overstated returns.
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

function MarketRow({ label, stat }: { label: string; stat: MarketStat | undefined }) {
    const n = stat?.n ?? 0;
    const scores = meanScores(stat);
    return (
        <tr className="border-t border-border">
            <td className="py-1.5">{label}</td>
            <td className="py-1.5 text-right text-text-dim">{n}</td>
            <td className="py-1.5 text-right">{n > 0 ? pct((stat?.hits ?? 0) / n) : '—'}</td>
            <td className="py-1.5 text-right">{scores ? scores.brier.toFixed(3) : '—'}</td>
            <td className="py-1.5 text-right">{scores ? scores.logLoss.toFixed(3) : '—'}</td>
        </tr>
    );
}

/** Model vs the bookmaker market, on the fixtures where a pre-kickoff price was logged. */
function MarketComparison({ vs }: { vs: RollingStats['vsMarket'] }) {
    const rows = (Object.keys(MARKET_LABEL) as MarketKey[])
        .map((k) => [k, vs?.[k]] as const)
        .filter((r): r is readonly [MarketKey, VsMarketStat] => (r[1]?.n ?? 0) > 0);

    return (
        <section>
            <h2 className="mb-1 text-sm font-semibold">Model vs the market</h2>
            <p className="mb-3 max-w-2xl text-xs text-text-dim">
                On fixtures where a bookmaker price was logged before kickoff, how the model’s
                published probabilities scored against the market’s own (margin removed). The market
                is the benchmark to beat: a positive edge means the model scored better.
            </p>
            {rows.length === 0 ? (
                <p className="text-xs text-text-faint">
                    No graded fixtures with a logged market price yet. Prices are logged for fixtures
                    within about four days of kickoff when live odds are available.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[34rem] text-sm">
                        <thead className="text-left text-xs uppercase tracking-wide text-text-faint">
                            <tr>
                                <th className="py-1.5">Market</th>
                                <th className="py-1.5 text-right">Fixtures</th>
                                <th className="py-1.5 text-right">Log loss · model</th>
                                <th className="py-1.5 text-right">· market</th>
                                <th className="py-1.5 text-right">Brier · model</th>
                                <th className="py-1.5 text-right">· market</th>
                                <th className="py-1.5 text-right">Edge</th>
                            </tr>
                        </thead>
                        <tbody className="tabular">
                            {rows.map(([k, s]) => {
                                const edge = (s.marketLogLoss - s.modelLogLoss) / s.n;
                                return (
                                    <tr key={k} className="border-t border-border">
                                        <td className="py-1.5">{MARKET_LABEL[k]}</td>
                                        <td className="py-1.5 text-right text-text-dim">{s.n}</td>
                                        <td className="py-1.5 text-right">{(s.modelLogLoss / s.n).toFixed(3)}</td>
                                        <td className="py-1.5 text-right text-text-dim">{(s.marketLogLoss / s.n).toFixed(3)}</td>
                                        <td className="py-1.5 text-right">{(s.modelBrier / s.n).toFixed(3)}</td>
                                        <td className="py-1.5 text-right text-text-dim">{(s.marketBrier / s.n).toFixed(3)}</td>
                                        <td
                                            className={`py-1.5 text-right ${edge >= 0 ? 'text-pos' : 'text-neg'}`}
                                            title="Market log loss minus model log loss, per fixture"
                                        >
                                            {edge >= 0 ? '+' : '−'}
                                            {Math.abs(edge).toFixed(3)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

/** Whether a learned recalibration curve is currently feeding back into the model. */
function RecalibrationNote({
    source,
    rawGraded,
    min,
    unit,
    what,
}: {
    source: CalibrationSource;
    rawGraded: number;
    min: number;
    unit: string;
    what: string;
}) {
    return (
        <p className="mt-3 text-xs text-text-faint">
            {source === 'raw' ? (
                <>
                    <span className="text-pos">● Recalibration live</span> — {what} are corrected
                    by a curve learned from the raw probabilities of {rawGraded} graded {unit} under
                    model v{MODEL_VERSION}, relearned on every rebuild.
                </>
            ) : source === 'interim' ? (
                <>
                    <span className="text-pos">● Recalibration live (interim)</span> — {what} use a
                    partial correction learned from published figures while model v{MODEL_VERSION}’s
                    raw-probability sample builds ({rawGraded}/{min} {unit}).
                </>
            ) : (
                <>
                    <span className="text-text-dim">○ Running uncalibrated</span> — raw model
                    probabilities until {min} {unit} are graded ({rawGraded}/{min} so far).
                </>
            )}
        </p>
    );
}

function CalibrationStatus({ allTime, current }: { allTime: RollingStats; current: RollingStats | null }) {
    const { source, rawGraded } = outcomeCalibrationFromStats(allTime, current);
    return (
        <RecalibrationNote
            source={source}
            rawGraded={rawGraded}
            min={CALIBRATION_MIN_TOTAL}
            unit="predictions"
            what="outcome probabilities"
        />
    );
}

function CornersCalibrationStatus({
    allTime,
    current,
}: {
    allTime: RollingStats;
    current: RollingStats | null;
}) {
    const { source, rawGraded } = cornersCalibrationFromStats(allTime, current);
    return (
        <RecalibrationNote
            source={source}
            rawGraded={rawGraded}
            min={CORNERS_CALIBRATION_MIN_TOTAL}
            unit="corner lines"
            what="corner over/under probabilities"
        />
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
