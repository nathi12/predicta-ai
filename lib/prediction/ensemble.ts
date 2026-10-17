// lib/prediction/ensemble.ts
// Combine the goal-model 1X2, the Elo 1X2, and (when present) the provider's
// own 1X2 into one distribution.

import type { OutcomeProbabilities } from '@/types';
import { DEFAULT_PARAMS, type ModelParams } from './params';

function norm(o: OutcomeProbabilities): OutcomeProbabilities {
    const s = o.home + o.draw + o.away || 1;
    return { home: o.home / s, draw: o.draw / s, away: o.away / s };
}

export function blendOutcomes(
    poisson: OutcomeProbabilities,
    elo: OutcomeProbabilities,
    provider?: OutcomeProbabilities | null,
    params: Pick<ModelParams, 'poissonWeight' | 'providerWeight'> = DEFAULT_PARAMS,
): OutcomeProbabilities {
    const p = norm(poisson);
    const e = norm(elo);
    const wp = params.poissonWeight;
    const we = 1 - wp;
    let blended: OutcomeProbabilities = {
        home: wp * p.home + we * e.home,
        draw: wp * p.draw + we * e.draw,
        away: wp * p.away + we * e.away,
    };
    if (provider) {
        const v = norm(provider);
        const wv = params.providerWeight;
        const wb = 1 - wv;
        blended = {
            home: wb * blended.home + wv * v.home,
            draw: wb * blended.draw + wv * v.draw,
            away: wb * blended.away + wv * v.away,
        };
    }
    return norm(blended);
}
