import type { MatchWithPrediction, TeamStrength } from '@/types';
import { favouriteOutcome, pct } from '@/lib/fixtures/view';
import { KickoffTime } from '@/components/KickoffTime';
import {
    ConfidenceMeter,
    Crest,
    DataQualityBadge,
    FormGuide,
    LeagueTag,
    OutcomeBar,
} from '@/components/primitives';

function TeamBlock({ side, align }: { side: TeamStrength; align: 'start' | 'end' }) {
    return (
        <div className={`flex min-w-0 flex-col gap-2 ${align === 'end' ? 'items-end text-right' : 'items-start'}`}>
            <Crest src={side.team.crest} fallback={side.team.tla || side.team.shortName} size={40} />
            <p className="break-words text-base font-semibold leading-tight text-text sm:text-lg">
                {side.team.shortName}
            </p>
            <p className="text-xs text-text-faint tabular">Elo {Math.round(side.elo)}</p>
            <FormGuide form={side.form} team={side.team.shortName} />
        </div>
    );
}

/** Scoreboard header + the 1X2 read-out: what a reader needs in the first few seconds. */
export function MatchHero({ match, prediction }: MatchWithPrediction) {
    const { home, away } = match;
    const fav = favouriteOutcome(prediction.outcome);
    const tiles = [
        { key: 'home', label: home.team.shortName, win: true, p: prediction.outcome.home, color: 'var(--color-home)' },
        { key: 'draw', label: 'Draw', win: false, p: prediction.outcome.draw, color: 'var(--color-draw)' },
        { key: 'away', label: away.team.shortName, win: true, p: prediction.outcome.away, color: 'var(--color-away)' },
    ] as const;
    const provider = match.providerOutcome;

    return (
        <section
            aria-labelledby="match-title"
            className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-6"
        >
            <h1 id="match-title" className="sr-only">
                {home.team.shortName} v {away.team.shortName} — match prediction
            </h1>

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-faint">
                <LeagueTag code={match.league} name={match.leagueName} />
                <span aria-hidden>{match.leagueName}</span>
                <span aria-hidden>·</span>
                <span className="text-text-dim">
                    <KickoffTime iso={match.kickoff} />
                </span>
                {match.venue && (
                    <>
                        <span aria-hidden>·</span>
                        <span>{match.venue}</span>
                    </>
                )}
            </p>

            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 sm:gap-6">
                <TeamBlock side={home} align="start" />
                <div className="pt-1 text-center">
                    <p className="text-3xl font-semibold leading-none tabular">
                        <span className="sr-only">Most likely score: </span>
                        {prediction.predictedScore.home}–{prediction.predictedScore.away}
                    </p>
                    <p aria-hidden className="mt-1.5 text-[11px] uppercase tracking-wide text-text-faint">
                        Most likely score
                    </p>
                    <p className="mt-2 text-xs text-text-dim tabular" title="Expected goals from the model">
                        xG {prediction.expectedGoals.home.toFixed(1)} – {prediction.expectedGoals.away.toFixed(1)}
                    </p>
                </div>
                <TeamBlock side={away} align="end" />
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
                {tiles.map((t) => (
                    <div key={t.key} className="min-w-0 rounded-[var(--radius-card)] border border-border bg-surface-2 p-3">
                        <p className="flex items-start gap-1.5 text-[11px] uppercase leading-tight tracking-wide text-text-faint">
                            <span
                                aria-hidden
                                className="mt-0.5 h-2 w-2 shrink-0 rounded-sm"
                                style={{ background: t.color }}
                            />
                            <span className="min-w-0 break-words">
                                {t.label}
                                {/* Narrow tiles drop "win"; screen readers always get it. */}
                                {t.win && <span className="max-sm:sr-only"> win</span>}
                            </span>
                        </p>
                        <p
                            className={`mt-1.5 text-2xl tabular ${
                                fav === t.key ? 'font-semibold text-text' : 'font-medium text-text-dim'
                            }`}
                        >
                            {pct(t.p)}
                        </p>
                    </div>
                ))}
            </div>
            {/* Same numbers as the tiles above, as one split — hidden from screen readers to avoid repeating them. */}
            <div aria-hidden className="mt-3">
                <OutcomeBar
                    outcome={prediction.outcome}
                    homeLabel={home.team.shortName}
                    awayLabel={away.team.shortName}
                />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-faint">
                <ConfidenceMeter value={prediction.confidence} showValue />
                <DataQualityBadge quality={prediction.dataQuality} />
                {provider && (
                    <span className="tabular" title="API-Football’s own 1X2 probabilities, one input to the blend">
                        API-Football view {pct(provider.home)} / {pct(provider.draw)} / {pct(provider.away)}
                    </span>
                )}
                <span>Model v{prediction.modelVersion}</span>
            </div>
        </section>
    );
}
