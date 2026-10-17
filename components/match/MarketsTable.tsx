import type { MarketLine, MarketProbabilities } from '@/types';
import { fairOdds, formatOdds } from '@/lib/slip/format';
import { LeanChip, ProbValue } from '@/components/primitives';

interface Row {
    label: string;
    /** Name of the other side of the line ("Under", "No"). */
    other: string;
    line: MarketLine;
}

function MarketRow({ label, other, line }: Row) {
    const shown = Math.round(line.probability * 100);
    return (
        <tr>
            <th scope="row" className="py-2 pr-3 text-left font-normal text-text-dim">
                {label}
            </th>
            <td className="py-2 pr-3">
                <ProbValue p={line.probability} className="w-20" />
            </td>
            <td className="hidden py-2 pr-3 text-right text-text-dim tabular sm:table-cell">
                {other} {100 - shown}%
            </td>
            <td className="py-2 pr-3 text-right tabular">{formatOdds(fairOdds(line.probability))}</td>
            <td className="py-2 text-right">
                <LeanChip lean={line.lean} />
            </td>
        </tr>
    );
}

/** Every goals / BTTS / corners line the model prices, with its complement and fair odds. */
export function MarketsTable({ markets }: { markets: MarketProbabilities }) {
    const goals: Row[] = [
        { label: 'Over 1.5 goals', other: 'Under', line: markets.over15 },
        { label: 'Over 2.5 goals', other: 'Under', line: markets.over25 },
        { label: 'Over 3.5 goals', other: 'Under', line: markets.over35 },
        { label: 'Both teams score', other: 'No', line: markets.btts },
    ];
    const c = markets.corners;
    const corners: Row[] = c
        ? [
              { label: 'Over 8.5 corners', other: 'Under', line: c.over85 },
              { label: 'Over 9.5 corners', other: 'Under', line: c.over95 },
              { label: 'Over 10.5 corners', other: 'Under', line: c.over105 },
              { label: 'Over 11.5 corners', other: 'Under', line: c.over115 },
          ]
        : [];

    return (
        <>
            {/* Scrolls inside its own box on narrow screens, never the page. */}
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                <table className="w-full min-w-[18rem] text-sm sm:min-w-[30rem]">
                    <caption className="sr-only">
                        Model probability for each market, the opposite side, and fair odds
                    </caption>
                    <thead className="text-left text-[11px] uppercase tracking-wide text-text-faint">
                        <tr>
                            <th scope="col" className="py-1.5 pr-3 font-medium">
                                Market
                            </th>
                            <th scope="col" className="py-1.5 pr-3 font-medium">
                                Model
                            </th>
                            {/* Derivable (100 − model), so phones drop it to keep the table on screen. */}
                            <th scope="col" className="hidden py-1.5 pr-3 text-right font-medium sm:table-cell">
                                Opposite
                            </th>
                            <th
                                scope="col"
                                className="py-1.5 pr-3 text-right font-medium"
                                title="1 ÷ model probability — no bookmaker margin"
                            >
                                Fair odds
                            </th>
                            <th scope="col" className="py-1.5 text-right font-medium">
                                Lean
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {goals.map((r) => (
                            <MarketRow key={r.label} {...r} />
                        ))}
                    </tbody>
                    {c && (
                        <tbody className="divide-y divide-border">
                            <tr>
                                <th
                                    scope="rowgroup"
                                    colSpan={5}
                                    className="pb-1.5 pt-5 text-left text-[11px] font-medium uppercase tracking-wide text-text-faint"
                                >
                                    Corners · ~{c.expected.toFixed(1)} expected
                                </th>
                            </tr>
                            {corners.map((r) => (
                                <MarketRow key={r.label} {...r} />
                            ))}
                        </tbody>
                    )}
                </table>
            </div>
            <p className="mt-3 text-[11px] text-text-faint">
                Fair odds are 1 ÷ the model probability, with no bookmaker margin.
                {c &&
                    (c.source === 'team-rates'
                        ? ' Corners blend both sides’ real corner history.'
                        : ' Corners are a proxy scaled from expected goals — less reliable.')}
            </p>
        </>
    );
}
