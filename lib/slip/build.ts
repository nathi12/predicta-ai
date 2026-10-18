// lib/slip/build.ts
// The curator: turn a pool of priced candidate legs into one bet slip.
//
// Objective — "the strongest slip that meets your brief":
//   single-market : the N highest-ranked selections in the chosen market.
//   target-odds   : safe / balanced — raise the per-leg probability floor as high
//                   as it goes while some one-leg-per-match combination
//                   (≤ maxLegs) still clears the target, then take the
//                   combination above that floor with the highest combined model
//                   probability. Combined odds may land above the target.
//                   value — the combination that clears the target with the
//                   highest combined model probability, any leg allowed.
//                   If nothing clears it, the closest we can get.

import { formatPct, product } from './format';
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
    /** Built by the strongest-legs search (safe / balanced target-odds). */
    strongestLegs?: boolean;
}

function finalize(legs: Selection[], req: SlipRequest, meta: FinalizeMeta): BetSlip {
    const figures = combine(legs);
    const warnings: string[] = [];
    const rationale: string[] = [];

    if (meta.strongestLegs && legs.length >= 2) {
        const weakest = Math.min(...legs.map((l) => l.modelProbability));
        rationale.push(
            `Strongest legs that reach ${req.targetOdds.toFixed(2)}: every leg is at least ${formatPct(weakest)} (${legs.length} legs, ${figures.combinedEffectiveOdds.toFixed(2)} combined).`,
        );
    }

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
            `${proxy} corners leg${proxy > 1 ? 's are' : ' is'} lower-confidence and ${proxy > 1 ? 'are' : 'is'} excluded from the tracked record.`,
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
            'Goals and BTTS probabilities aren’t recalibrated against the record yet, and the combined figure assumes the legs are independent — treat it as a guide, not a true win chance.',
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

interface SearchResult {
    legs: Selection[];
    reached: boolean;
}

/**
 * Exhaustive one-option-per-fixture search over a pool of option lists: the
 * combination (2…maxLegs legs) that clears the target with the highest
 * combined model probability, or — if none does — the one that gets closest.
 */
function searchPool(pool: Selection[][], target: number, maxLegs: number): SearchResult | null {
    interface Cand {
        legs: Selection[];
        prob: number;
        odds: number;
    }
    let best: Cand | null = null; // reaches target: maximise combined probability
    let fallback: Cand | null = null; // nothing reaches it: get as close as possible

    for (let k = 2; k <= Math.min(maxLegs, pool.length); k++) {
        for (const fixtureSet of combinations(pool, k)) {
            for (const legs of assignments(fixtureSet)) {
                const prob = product(legs.map((s) => s.modelProbability));
                const odds = product(legs.map((s) => s.effectiveOdds));
                if (odds >= target) {
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
    return chosen ? { legs: chosen.legs, reached: best !== null } : null;
}

/** Highest effective odds among a fixture's options at or above the floor; 0 if none. */
function reachAt(opts: Selection[], floor: number): number {
    let best = 0;
    for (const s of opts) {
        if (s.modelProbability >= floor && s.effectiveOdds > best) best = s.effectiveOdds;
    }
    return best;
}

/**
 * The highest per-leg probability floor at which some one-leg-per-match slip of
 * at most `maxLegs` legs still clears `target`, or null if none does. Lowering
 * the floor only ever adds options, so feasibility is monotone and the distinct
 * leg probabilities can be binary-searched.
 */
function highestReachableFloor(
    fixtures: Selection[][],
    target: number,
    maxLegs: number,
): number | null {
    const canReach = (floor: number): boolean => {
        const reach = fixtures
            .map((opts) => reachAt(opts, floor))
            .filter((o) => o > 1)
            .sort((a, b) => b - a)
            .slice(0, maxLegs);
        return reach.length >= 2 && product(reach) >= target;
    };

    const floors = [...new Set(fixtures.flat().map((s) => s.modelProbability))].sort(
        (a, b) => b - a,
    );
    let found: number | null = null;
    let lo = 0;
    let hi = floors.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (canReach(floors[mid])) {
            found = floors[mid];
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }
    return found;
}

/**
 * Pool for the strongest-legs search: only options at or above the floor; per
 * fixture the two strongest plus the longest-priced (so the combination that
 * proved the floor reachable is always searchable), fixtures ordered by that
 * longest price so those fixtures always make the cap.
 */
function strongPool(fixtures: Selection[][], floor: number): Selection[][] {
    const pool: Array<{ opts: Selection[]; reach: number }> = [];
    for (const all of fixtures) {
        const opts = all
            .filter((s) => s.modelProbability >= floor)
            .sort((a, b) => b.modelProbability - a.modelProbability);
        if (opts.length === 0) continue;
        const reach = opts.reduce((a, b) => (b.effectiveOdds > a.effectiveOdds ? b : a));
        const keep = opts.slice(0, 2);
        if (!keep.includes(reach)) keep.push(reach);
        pool.push({ opts: keep, reach: reach.effectiveOdds });
    }
    return pool
        .sort((a, b) => b.reach - a.reach || a.opts[0].kickoff.localeCompare(b.opts[0].kickoff))
        .slice(0, TARGET_ODDS_POOL_CAP)
        .map((p) => p.opts);
}

/**
 * Pool for the value preset, and the fallback when the target is out of reach:
 * fixtures ranked by their best option; per fixture up to three distinct-odds
 * options (safest / middle / reach), so the search can trade a short-priced
 * pick for a longer one when that's what gets closest.
 */
function rankedPool(fixtures: Selection[][], rank: 'probability' | 'edge'): Selection[][] {
    return fixtures
        .map((opts) =>
            [...opts].sort(
                (a, b) =>
                    selectionScore(b, rank) - selectionScore(a, rank) ||
                    b.modelProbability - a.modelProbability,
            ),
        )
        .sort(
            (a, b) =>
                selectionScore(b[0], rank) - selectionScore(a[0], rank) ||
                a[0].kickoff.localeCompare(b[0].kickoff),
        )
        .slice(0, TARGET_ODDS_POOL_CAP)
        .map((opts) =>
            opts.length <= 3
                ? opts
                : [opts[0], opts[Math.floor(opts.length / 2)], opts[opts.length - 1]],
        );
}

const byKickoff = (legs: Selection[]): Selection[] =>
    [...legs].sort((a, b) => a.kickoff.localeCompare(b.kickoff));

function buildTargetOdds(selections: Selection[], req: SlipRequest): BetSlip {
    const rank = RISK_PRESETS[req.risk].rank;

    const byMatch = new Map<string, Selection[]>();
    for (const s of selections) {
        const arr = byMatch.get(s.matchId);
        if (arr) arr.push(s);
        else byMatch.set(s.matchId, [s]);
    }
    const fixtures = [...byMatch.values()];

    if (fixtures.length < 2) {
        return finalize(
            rankedPool(fixtures, rank).map((f) => f[0]),
            req,
            { targetReached: false },
        );
    }

    const maxLegs = Math.max(2, req.maxLegs);

    // Safe / balanced: every leg as strong as the target and leg cap allow.
    if (rank === 'probability') {
        const floor = highestReachableFloor(fixtures, req.targetOdds, maxLegs);
        if (floor != null) {
            const found = searchPool(strongPool(fixtures, floor), req.targetOdds, maxLegs);
            if (found?.reached) {
                return finalize(byKickoff(found.legs), req, {
                    targetReached: true,
                    strongestLegs: true,
                });
            }
        }
    }

    // Value preset, or the target is out of reach at any floor.
    const found = searchPool(rankedPool(fixtures, rank), req.targetOdds, maxLegs);
    if (!found) return finalize([], req, { targetReached: false });
    return finalize(byKickoff(found.legs), req, { targetReached: found.reached });
}

export function buildSlip(selections: Selection[], req: SlipRequest): BetSlip {
    return req.mode === 'single-market'
        ? buildSingleMarket(selections, req)
        : buildTargetOdds(selections, req);
}
