import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Method',
    description: 'How the PredictaAI football model works.',
};

export default function MethodPage() {
    return (
        <article className="prose-invert max-w-2xl space-y-6 text-sm leading-relaxed text-text-dim">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-text">How the model works</h1>
            </header>

            <section className="space-y-2">
                <h2 className="text-base font-semibold text-text">Goal model</h2>
                <p>
                    Each team gets venue-specific attack and defence ratings from the home and away
                    league tables, normalised to the division average. Early-season rates are shrunk
                    towards the league mean so a two-game sample doesn’t dominate. Those ratings give
                    an expected-goals figure for each side, which feeds a{' '}
                    <strong className="text-text">Dixon-Coles bivariate Poisson</strong> — a Poisson
                    model with a correction that lifts the low-scoring draw scorelines football
                    actually produces. Every market (1X2, over/under, both-teams-to-score, correct
                    score) is read off that single score matrix, so the numbers can’t contradict each
                    other.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-base font-semibold text-text">Ratings &amp; form</h2>
                <p>
                    An Elo rating, seeded from the current table and updated by replaying this
                    season’s results with a goal-difference-aware K-factor, provides a second opinion
                    on the match outcome. Recent form (last five games) nudges the expected-goals
                    figures by up to ±8%. Head-to-head history adjusts the projected goal total when
                    there are enough previous meetings.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-base font-semibold text-text">Enrichment</h2>
                <p>
                    For imminent fixtures, and within a strict daily request budget, the model pulls
                    live form and the provider’s own probability estimate from API-Football and blends
                    them in. Fixtures with this extra data are marked <em>Enriched</em>; the rest run
                    on league tables and form alone (<em>Core data</em>) and are given wider
                    uncertainty.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-base font-semibold text-text">Calibration &amp; honesty</h2>
                <p>
                    Confidence is a real quantity — the sharpness of the outcome distribution scaled
                    by how much data backs it — not a marketing number. Predictions are logged and
                    graded against results. Once enough have been graded, a recalibration curve —
                    how often a forecast of a given probability actually lands — is relearned from
                    that log on every rebuild and folded back into the 1X2 output, so the numbers
                    track their own track record. It lives on the{' '}
                    <a className="text-accent underline-offset-2 hover:underline" href="/accuracy">
                        accuracy page
                    </a>
                    . A realistic ceiling for match-outcome accuracy is about 53–56%; anyone claiming
                    much more is not measuring honestly.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-base font-semibold text-text">Bet-slip builder</h2>
                <p>
                    The <a className="text-accent underline-offset-2 hover:underline" href="/slip">
                        slip builder
                    </a>{' '}
                    turns these probabilities into an accumulator. Every fixture is expanded into
                    candidate legs across match result, double chance, over/under and both-teams-to-score;
                    each leg is priced at its fair odds (1 ÷ model probability) and, where a live feed has
                    them, at real bookmaker odds. In <em>target-odds</em> mode the curator searches
                    one-leg-per-match combinations and returns the one that clears your target with the
                    highest combined model probability — the safest slip that fits. In{' '}
                    <em>single-market</em> mode it just takes the strongest N selections in your chosen
                    market. Combined probability is the product of the legs, which assumes they’re
                    independent; real fixtures are only roughly so, and the underlying probabilities are
                    not yet calibrated — so the combined figure is a guide, not a true win chance. Against
                    real odds an accumulator’s expected value is almost always negative, because each leg
                    carries the bookmaker’s margin.
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-base font-semibold text-text">Limitations</h2>
                <p>
                    The model has no knowledge of injuries, suspensions, line-ups, motivation, weather
                    or in-game events. Corner predictions start as a proxy from attacking volume;
                    once both teams have a handful of graded games, their real corners-for/against
                    history is blended in, but this is still the least reliable market shown. Newly
                    promoted teams have thin data until several rounds have been played.
                </p>
            </section>
        </article>
    );
}
