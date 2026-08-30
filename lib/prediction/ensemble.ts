// lib/prediction/ensemble.ts
// Combine the goal-model 1X2, the Elo 1X2, and (when present) the provider's
// own 1X2 into one distribution.

import type { OutcomeProbabilities } from '@/types';

function norm(o: OutcomeProbabilities): OutcomeProbabilities {
    const s = o.home + o.draw + o.away || 1;
    return { home: o.home / s, draw: o.draw / s, away: o.away / s };
}

export function blendOutcomes(
    poisson: OutcomeProbabilities,
    elo: OutcomeProbabilities,
    provider?: OutcomeProbabilities | null,
): OutcomeProbabilities {
    const p = norm(poisson);
    const e = norm(elo);
    let blended: OutcomeProbabilities = {
        home: 0.58 * p.home + 0.42 * e.home,
        draw: 0.58 * p.draw + 0.42 * e.draw,
        away: 0.58 * p.away + 0.42 * e.away,
    };
    if (provider) {
        const v = norm(provider);
        blended = {
            home: 0.78 * blended.home + 0.22 * v.home,
            draw: 0.78 * blended.draw + 0.22 * v.draw,
            away: 0.78 * blended.away + 0.22 * v.away,
        };
    }
    return norm(blended);
}
