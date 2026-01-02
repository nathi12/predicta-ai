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
            // Convert to unknown first, then to the extended type (TypeScript requirement)
            const footballPred = prediction as unknown as {
                homeWin: number;
                awayWin: number;
                draw: number;
                expectedGoals: number;
                btts: number;
                over25: number;
                match: {
                    homeTeam: {
                        name: string;
                        wins: number;
                        played: number;
                        goals: number;
                    };
                    awayTeam: {
                        name: string;
                        wins: number;
                        played: number;
                        goals: number;
                    };
                };
            };

            const { match } = footballPred;
            const favoredTeam =
                footballPred.homeWin > footballPred.awayWin
                    ? match.homeTeam.name
                    : match.awayTeam.name;
            const maxProb = Math.max(footballPred.homeWin, footballPred.awayWin);
            const advantage = maxProb * 100 > 70 ? 'strong' : 'moderate';

            // Calculate metrics from available FootballTeam data
            const homeWinRate = match.homeTeam.wins / Math.max(match.homeTeam.played, 1);
            const homeXG = match.homeTeam.goals / Math.max(match.homeTeam.played, 1);
            const awayXG = match.awayTeam.goals / Math.max(match.awayTeam.played, 1);

            return (
                <>
                    {favoredTeam} has a <strong style={{ color: '#00ff9d' }}>{advantage}</strong>{' '}
                    advantage with a{' '}
                    <strong style={{ color: '#00ff9d' }}>{(maxProb * 100).toFixed(1)}%</strong> win
                    probability. This prediction is based on superior{' '}
                    {footballPred.homeWin > footballPred.awayWin ? (
                        <>
                            home form (win rate:{' '}
                            {(homeWinRate * 100).toFixed(0)}%)
                        </>
                    ) : (
                        <>recent performance and offensive strength</>
                    )}
                    , higher expected goals (xG:{' '}
                    {footballPred.homeWin > footballPred.awayWin
                        ? homeXG.toFixed(2)
                        : awayXG.toFixed(2)}
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
        }

        return <>Analysis not available for this match type.</>;
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