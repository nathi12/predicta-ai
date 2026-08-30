// lib/slip/build.ts
// The curator: turn a pool of priced candidate legs into one bet slip.
//
// Objective — "the safest slip that meets your brief":
//   single-market : the N highest-ranked selections in the chosen market.
//   target-odds   : the one-leg-per-match combination (≤ maxLegs) whose combined
//                   odds clear the target with the highest combined model
//                   probability. If nothing clears it, the closest we can get.

import { product } from './format';
import { selectionScore } from './selections';
import {
    RISK_PRESETS,
    TARGET_ODDS_POOL_CAP,
    type BetSlip,
    type Selection,
    type SlipRequest,
} from './types';

type CombinedFigures = Pick<
    BetSlip,
    | 'legs'
    | 'combinedModelProbability'
    | 'combinedFairOdds'
    | 'combinedBookOdds'
    | 'combinedEffectiveOdds'
    | 'combinedEdge'
>;

function combine(legs: Selection[]): CombinedFigures {
    const combinedModelProbability = product(legs.map((l) => l.modelProbability));
    const combinedFairOdds = product(legs.map((l) => l.fairOdds));
    const allBook = legs.length > 0 && legs.every((l) => l.bookOdds != null);
    const combinedBookOdds = allBook ? product(legs.map((l) => l.bookOdds as number)) : null;
    const combinedEffectiveOdds = product(legs.map((l) => l.effectiveOdds));
    const combinedEdge =
        combinedBookOdds != null ? combinedModelProbability * combinedBookOdds - 1 : null;
    return {
        legs,
        combinedModelProbability,
        combinedFairOdds,
        combinedBookOdds,
        combinedEffectiveOdds,
        combinedEdge,
    };
}

function bestPerMatch(selections: Selection[], rank: 'probability' | 'edge'): Selection[] {
    const byMatch = new Map<string, Selection>();
    for (const s of selections) {
        const cur = byMatch.get(s.matchId);
        if (!cur || selectionScore(s, rank) > selectionScore(cur, rank)) byMatch.set(s.matchId, s);
    }
    return [...byMatch.values()];
}

function* combinations<T>(items: T[], k: number): Generator<T[]> {
    const n = items.length;
    if (k <= 0 || k > n) return;
    const idx = Array.from({ length: k }, (_, i) => i);
    for (;;) {
        yield idx.map((i) => items[i]);
        let i = k - 1;
        while (i >= 0 && idx[i] === n - k + i) i--;
        if (i < 0) return;
        idx[i]++;
        for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
}

interface FinalizeMeta {
    targetReached: boolean;
}

function finalize(legs: Selection[], req: SlipRequest, meta: FinalizeMeta): BetSlip {
    const figures = combine(legs);
    const warnings: string[] = [];
    const rationale: string[] = [];

    if (legs.length < 2) {
        warnings.push(
            'Not enough qualifying selections for a slip — loosen the filters: lower the probability floor, widen the date window, or add leagues.',
        );
    }

    if (req.mode === 'target-odds' && legs.length >= 2 && !meta.targetReached) {
        warnings.push(
            `Couldn't reach ${req.targetOdds.toFixed(2)} within ${req.maxLegs} legs — this is the closest combination (${figures.combinedEffectiveOdds.toFixed(2)}). Raise the max legs or lower the target.`,
        );
    }

    const noBook = legs.filter((l) => l.oddsSource === 'model').length;
    if (noBook > 0) {
        warnings.push(
            `No live odds for ${noBook} of ${legs.length} legs — fair odds (1 ÷ model probability) are shown for those, and the combined edge can't be computed.`,
        );
    }

    const proxy = legs.filter((l) => !l.autoGradable).length;
    if (proxy > 0) {
        warnings.push(
            `${proxy} leg${proxy > 1 ? 's use' : ' uses'} the corners proxy — an estimate from attacking volume, not a corner-count feed — and ${proxy > 1 ? 'are' : 'is'} excluded from the tracked record.`,
        );
    }

    if (legs.length > 0 && legs.every((l) => l.dataQuality === 'core')) {
        warnings.push(
            'Every leg runs on core data only — no live form or provider signals for these fixtures.',
        );
    }

    if (figures.combinedEdge != null && figures.combinedEdge < 0) {
        warnings.push(
            `At these odds the slip's expected value is ${(figures.combinedEdge * 100).toFixed(1)}% — negative, as most accumulators are. A curated slip is a convenience, not an edge.`,
        );
    }

    if (legs.length >= 2) {
        warnings.push(
            'Model probabilities are uncalibrated and the combined figure assumes the legs are independent — treat it as a guide, not a true win chance.',
        );
    }

    for (const leg of legs) {
        if (leg.reason) rationale.push(`${leg.homeTeam} v ${leg.awayTeam} — ${leg.reason}`);
    }

    return { ...figures, rationale, warnings };
}

function buildSingleMarket(selections: Selection[], req: SlipRequest): BetSlip {
    const rank = RISK_PRESETS[req.risk].rank;
    const pool = bestPerMatch(
        selections.filter((s) => s.market === req.market),
        rank,
    ).sort(
        (a, b) =>
            selectionScore(b, rank) - selectionScore(a, rank) ||
            b.modelProbability - a.modelProbability ||
            a.kickoff.localeCompare(b.kickoff),
    );

    const legs = pool.slice(0, Math.max(2, req.legs)).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    return finalize(legs, req, { targetReached: legs.length >= 2 });
}

/** Cartesian product of per-leg option lists — one selection picked per fixture. */
function* assignments(optionLists: Selection[][]): Generator<Selection[]> {
    if (optionLists.length === 0) {
        yield [];
        return;
    }
    const [head, ...rest] = optionLists;
    for (const opt of head) {
        for (const tail of assignments(rest)) yield [opt, ...tail];
    }
}

function buildTargetOdds(selections: Selection[], req: SlipRequest): BetSlip {
    const rank = RISK_PRESETS[req.risk].rank;

    // Group viable selections by fixture, best market first. Keeping several
    // markets per fixture lets the search trade a safe-but-short-priced pick
    // (e.g. double chance ~1.10) for a favourite ~1.35 when that's what reaches
    // the target in fewer legs.
    const byMatch = new Map<string, Selection[]>();
    for (const s of selections) {
        const arr = byMatch.get(s.matchId);
        if (arr) arr.push(s);
        else byMatch.set(s.matchId, [s]);
    }
    for (const arr of byMatch.values()) {
        arr.sort(
            (a, b) =>
                selectionScore(b, rank) - selectionScore(a, rank) ||
                b.modelProbability - a.modelProbability,
        );
    }

    const fixtures = [...byMatch.values()].sort(
        (a, b) =>
            selectionScore(b[0], rank) - selectionScore(a[0], rank) ||
            a[0].kickoff.localeCompare(b[0].kickoff),
    );

    if (fixtures.length < 2) {
        return finalize(
            fixtures.map((f) => f[0]),
            req,
            { targetReached: false },
        );
    }

    const maxLegs = Math.min(Math.max(2, req.maxLegs), fixtures.length);
    const pool = fixtures.slice(0, Math.min(fixtures.length, TARGET_ODDS_POOL_CAP));

    // Per fixture: up to three distinct-odds options (safest / middle / reach).
    const optionsFor = (opts: Selection[]): Selection[] =>
        opts.length <= 3 ? opts : [opts[0], opts[Math.floor(opts.length / 2)], opts[opts.length - 1]];

    interface Cand {
        legs: Selection[];
        prob: number;
        odds: number;
    }
    let best: Cand | null = null; // reaches target: maximise combined probability
    let fallback: Cand | null = null; // nothing reaches it: get as close as possible

    for (let k = 2; k <= maxLegs; k++) {
        for (const fixtureSet of combinations(pool, k)) {
            for (const legs of assignments(fixtureSet.map(optionsFor))) {
                const prob = product(legs.map((s) => s.modelProbability));
                const odds = product(legs.map((s) => s.effectiveOdds));
                if (odds >= req.targetOdds) {
                    if (
                        !best ||
                        prob > best.prob ||
                        (prob === best.prob && legs.length < best.legs.length)
                    ) {
                        best = { legs, prob, odds };
                    }
                } else if (
                    !fallback ||
                    odds > fallback.odds ||
                    (odds === fallback.odds && legs.length < fallback.legs.length)
                ) {
                    fallback = { legs, prob, odds };
                }
            }
        }
    }

    const chosen = best ?? fallback;
    if (!chosen) return finalize([], req, { targetReached: false });
    const legs = [...chosen.legs].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    return finalize(legs, req, { targetReached: best !== null });
}

export function buildSlip(selections: Selection[], req: SlipRequest): BetSlip {
    return req.mode === 'single-market'
        ? buildSingleMarket(selections, req)
        : buildTargetOdds(selections, req);
}
