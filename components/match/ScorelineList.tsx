import type { Scoreline } from '@/types';
import { pct } from '@/lib/fixtures/view';

const pct1 = (p: number) => `${(p * 100).toFixed(1)}%`;

/** The model's most likely exact scores, bars scaled to the most likely one. */
export function ScorelineList({
    scorelines,
    home,
    away,
}: {
    scorelines: Scoreline[];
    home: string;
    away: string;
}) {
    if (scorelines.length === 0) {
        return <p className="text-sm text-text-faint">No scoreline breakdown for this fixture.</p>;
    }
    const max = Math.max(...scorelines.map((s) => s.probability));
    const share = scorelines.reduce((sum, s) => sum + s.probability, 0);

    return (
        <>
            <ol className="space-y-2.5">
                {scorelines.map((s) => (
                    <li
                        key={`${s.home}-${s.away}`}
                        className="grid grid-cols-[3rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm"
                    >
                        <span className="font-medium text-text tabular">
                            <span aria-hidden>
                                {s.home}–{s.away}
                            </span>
                            <span className="sr-only">
                                {home} {s.home}, {away} {s.away}:
                            </span>
                        </span>
                        <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-border">
                            <span
                                className="block h-full rounded-full bg-text-faint"
                                style={{ width: `${(s.probability / max) * 100}%` }}
                            />
                        </span>
                        <span className="text-right text-text-dim tabular">{pct1(s.probability)}</span>
                    </li>
                ))}
            </ol>
            <p className="mt-3 text-xs text-text-faint">
                Together these {scorelines.length} scores cover {pct(share)} of the model’s score
                distribution — any single exact score is unlikely.
            </p>
        </>
    );
}
