import type { ReactNode } from 'react';
import type { RecordSplit, TeamStrength } from '@/types';
import { formPoints } from '@/lib/prediction/strength';
import { FormGuide } from '@/components/primitives';

const perGame = (n: number, played: number) => (played > 0 ? (n / played).toFixed(1) : '—');
const record = (r: RecordSplit) => `${r.won}-${r.draw}-${r.lost}`;
const goals = (r: RecordSplit) => `${perGame(r.goalsFor, r.played)} – ${perGame(r.goalsAgainst, r.played)}`;
const rating = (x: number | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);

interface Row {
    label: string;
    hint?: string;
    home: ReactNode;
    away: ReactNode;
}

/** Mirrored home | statistic | away table of the inputs the model reads. */
export function TeamComparison({ home, away }: { home: TeamStrength; away: TeamStrength }) {
    const rows: Row[] = [
        { label: 'Elo rating', home: Math.round(home.elo), away: Math.round(away.elo) },
        {
            label: 'Form',
            hint: 'oldest → newest',
            home: <FormGuide form={home.form} team={home.team.shortName} size="sm" />,
            away: <FormGuide form={away.form} team={away.team.shortName} size="sm" />,
        },
        { label: 'Points, last 5', home: `${formPoints(home.form)}/15`, away: `${formPoints(away.form)}/15` },
        { label: 'Played', home: home.overall.played, away: away.overall.played },
        { label: 'Season W-D-L', home: record(home.overall), away: record(away.overall) },
        { label: 'Goals per game', hint: 'for – against', home: goals(home.overall), away: goals(away.overall) },
        {
            label: 'Venue W-D-L',
            hint: `${home.team.shortName} at home · ${away.team.shortName} away`,
            home: record(home.home),
            away: record(away.away),
        },
        {
            label: 'Venue goals per game',
            hint: 'for – against',
            home: goals(home.home),
            away: goals(away.away),
        },
    ];

    if (home.enriched || away.enriched) {
        const recent = (t: TeamStrength) =>
            t.enriched
                ? `${t.enriched.recentGoalsFor.toFixed(1)} – ${t.enriched.recentGoalsAgainst.toFixed(1)}`
                : '—';
        rows.push(
            { label: 'Last-5 goals per game', hint: 'for – against', home: recent(home), away: recent(away) },
            {
                label: 'Attack rating',
                hint: 'API-Football',
                home: rating(home.enriched?.attackRating),
                away: rating(away.enriched?.attackRating),
            },
            {
                label: 'Defence rating',
                hint: 'API-Football',
                home: rating(home.enriched?.defenseRating),
                away: rating(away.enriched?.defenseRating),
            },
        );
    }

    return (
        // Capped width: the mirrored values stay close enough to compare across.
        <table className="mx-auto w-full max-w-3xl text-sm">
            <caption className="sr-only">
                Team comparison: {home.team.shortName} against {away.team.shortName}
            </caption>
            <thead className="text-[11px] uppercase tracking-wide text-text-faint">
                <tr>
                    <th scope="col" className="w-[30%] py-1.5 text-left font-medium sm:w-[34%]">
                        {home.team.shortName}
                    </th>
                    <th scope="col" className="py-1.5 font-medium">
                        <span className="sr-only">Statistic</span>
                    </th>
                    <th scope="col" className="w-[30%] py-1.5 text-right font-medium sm:w-[34%]">
                        {away.team.shortName}
                    </th>
                </tr>
            </thead>
            <tbody className="divide-y divide-border">
                {rows.map((r) => (
                    <tr key={r.label}>
                        <td className="py-2 text-left font-medium text-text tabular">{r.home}</td>
                        <th scope="row" className="px-2 py-2 text-center text-[11px] font-normal text-text-dim sm:text-xs">
                            {r.label}
                            {r.hint && <span className="block text-[10px] text-text-faint">{r.hint}</span>}
                        </th>
                        <td className="py-2 text-right font-medium text-text tabular">{r.away}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
