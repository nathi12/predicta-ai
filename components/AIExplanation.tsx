import React from 'react';
import { Activity } from 'lucide-react';
import { Prediction } from '@/types';
import { isFootballPrediction } from '@/lib/analytics';

interface AIExplanationProps {
    prediction: Prediction;
}

export const AIExplanation: React.FC<AIExplanationProps> = ({ prediction }) => {
    const isFootball = isFootballPrediction(prediction);

    const getExplanation = () => {
        if (isFootball) {
            const footballPred = prediction;
            const { match } = footballPred;
            const favoredTeam =
                footballPred.homeWin > footballPred.awayWin
                    ? match.homeTeam.name
                    : match.awayTeam.name;
            const maxProb = Math.max(footballPred.homeWin, footballPred.awayWin);
            const advantage = maxProb * 100 > 70 ? 'strong' : 'moderate';

            return (
                <>
                    {favoredTeam} has a <strong style={{ color: '#00ff9d' }}>{advantage}</strong>{' '}
                    advantage with a{' '}
                    <strong style={{ color: '#00ff9d' }}>{(maxProb * 100).toFixed(1)}%</strong> win
                    probability. This prediction is based on superior{' '}
                    {footballPred.homeWin > footballPred.awayWin ? (
                        <>
                            home form (win rate:{' '}
                            {(match.homeTeam.homeWinRate * 100).toFixed(0)}%)
                        </>
                    ) : (
                        <>recent performance and offensive strength</>
                    )}
                    , higher expected goals (xG:{' '}
                    {footballPred.homeWin > footballPred.awayWin
                        ? match.homeTeam.xG.toFixed(2)
                        : match.awayTeam.xG.toFixed(2)}
                    ), and better defensive stability. The model suggests{' '}
                    <strong style={{ color: '#ffd93d' }}>
                        {footballPred.expectedGoals.toFixed(2)} total goals
                    </strong>
                    , with{' '}
                    <strong style={{ color: '#00b8ff' }}>
                        {(footballPred.btts * 100).toFixed(0)}% probability
                    </strong>{' '}
                    of both teams scoring.
                    {footballPred.over25 > 0.6 && (
                        <>
                            {' '}
                            The <strong style={{ color: '#00ff9d' }}>Over 2.5 goals</strong> market
                            shows value at {(footballPred.over25 * 100).toFixed(0)}% confidence.
                        </>
                    )}
                </>
            );
        } else {
            const basketballPred = prediction;
            const { match } = basketballPred;
            const favoredTeam =
                basketballPred.homeWin > basketballPred.awayWin
                    ? match.homeTeam.name
                    : match.awayTeam.name;
            const maxProb = Math.max(basketballPred.homeWin, basketballPred.awayWin);

            return (
                <>
                    {favoredTeam} is favored to win with a{' '}
                    <strong style={{ color: '#00ff9d' }}>{(maxProb * 100).toFixed(1)}%</strong>{' '}
                    probability. The analysis considers{' '}
                    {basketballPred.homeWin > basketballPred.awayWin ? (
                        <>
                            home court advantage and higher offensive rating (
                            {match.homeTeam.offensiveRating.toFixed(1)})
                        </>
                    ) : (
                        <>superior offensive efficiency and better pace control</>
                    )}
                    . Expected final score is approximately{' '}
                    <strong style={{ color: '#00ff9d' }}>
                        {basketballPred.expectedHomePoints.toFixed(0)}
                    </strong>{' '}
                    to{' '}
                    <strong style={{ color: '#00b8ff' }}>
                        {basketballPred.expectedAwayPoints.toFixed(0)}
                    </strong>
                    , with a predicted spread of{' '}
                    <strong style={{ color: '#ffd93d' }}>
                        {Math.abs(basketballPred.spread).toFixed(1)} points
                    </strong>
                    . Total points projection is{' '}
                    <strong style={{ color: '#ff6b00' }}>
                        {basketballPred.totalPoints.toFixed(1)}
                    </strong>{' '}
                    for Over/Under betting markets.
                </>
            );
        }
    };

    return (
        <div
            style={{
                marginTop: '24px',
                padding: '20px',
                background:
                    'linear-gradient(135deg, rgba(0, 255, 157, 0.1) 0%, rgba(0, 184, 255, 0.1) 100%)',
                borderRadius: '12px',
                border: '1px solid rgba(0, 255, 157, 0.3)'
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px'
                }}
            >
                <Activity size={20} style={{ color: '#00ff9d' }} />
                <h4
                    style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#00ff9d' }}
                >
                    AI ANALYSIS EXPLANATION
                </h4>
            </div>
            <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6', color: '#e8eaed' }}>
                {getExplanation()}
            </p>
        </div>
    );
};