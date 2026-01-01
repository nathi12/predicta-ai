import React from 'react';
import { BasketballPrediction } from '@/types';

interface BasketballPredictionDisplayProps {
    prediction: BasketballPrediction;
}

export const BasketballPredictionDisplay: React.FC<BasketballPredictionDisplayProps> = ({
    prediction
}) => {
    const { match } = prediction;

    return (
        <>
            {/* Match Outcome Probabilities */}
            <div className="stat-card" style={{ marginBottom: '24px' }}>
                <h3
                    style={{
                        fontSize: '16px',
                        marginBottom: '16px',
                        fontWeight: 700,
                        color: '#ff6b00'
                    }}
                >
                    Match Result Probabilities
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {[
                        { label: 'Home Win', prob: prediction.homeWin, color: '#00ff9d' },
                        { label: 'Away Win', prob: prediction.awayWin, color: '#00b8ff' }
                    ].map((outcome, idx) => (
                        <div
                            key={idx}
                            style={{
                                textAlign: 'center',
                                padding: '20px',
                                background: `rgba(${outcome.color === '#00ff9d' ? '0, 255, 157' : '0, 184, 255'
                                    }, 0.1)`,
                                borderRadius: '12px',
                                border: `2px solid ${outcome.color}`
                            }}
                        >
                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                                {outcome.label}
                            </div>
                            <div
                                style={{
                                    fontSize: '32px',
                                    fontWeight: 700,
                                    color: outcome.color,
                                    marginBottom: '8px'
                                }}
                            >
                                {(outcome.prob * 100).toFixed(1)}%
                            </div>
                            <div
                                className="prob-bar"
                                style={{
                                    width: `${outcome.prob * 100}%`,
                                    background: outcome.color,
                                    margin: '0 auto'
                                }}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Basketball Markets */}
            <div className="stat-card" style={{ marginBottom: '24px' }}>
                <h3
                    style={{
                        fontSize: '16px',
                        marginBottom: '16px',
                        fontWeight: 700,
                        color: '#ff6b00'
                    }}
                >
                    Betway Market Insights
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    <div
                        style={{
                            padding: '16px',
                            background: 'rgba(0, 255, 157, 0.05)',
                            borderRadius: '12px',
                            border: '1px solid rgba(0, 255, 157, 0.2)'
                        }}
                    >
                        <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>
                            Expected Home Points
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#00ff9d' }}>
                            {prediction.expectedHomePoints.toFixed(1)}
                        </div>
                    </div>

                    <div
                        style={{
                            padding: '16px',
                            background: 'rgba(0, 184, 255, 0.05)',
                            borderRadius: '12px',
                            border: '1px solid rgba(0, 184, 255, 0.2)'
                        }}
                    >
                        <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>
                            Expected Away Points
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#00b8ff' }}>
                            {prediction.expectedAwayPoints.toFixed(1)}
                        </div>
                    </div>

                    <div
                        style={{
                            padding: '16px',
                            background: 'rgba(255, 217, 61, 0.05)',
                            borderRadius: '12px',
                            border: '1px solid rgba(255, 217, 61, 0.2)'
                        }}
                    >
                        <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>
                            Total Points O/U
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#ffd93d' }}>
                            {prediction.totalPoints.toFixed(1)}
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        marginTop: '16px',
                        padding: '16px',
                        background: 'rgba(255, 107, 0, 0.05)',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 107, 0, 0.2)',
                        textAlign: 'center'
                    }}
                >
                    <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>
                        Predicted Point Spread
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: '#ff6b00' }}>
                        {prediction.spread > 0 ? '+' : ''}
                        {prediction.spread.toFixed(1)}
                    </div>
                </div>
            </div>

            {/* Basketball Stats */}
            <div className="stat-card">
                <h3
                    style={{
                        fontSize: '16px',
                        marginBottom: '16px',
                        fontWeight: 700,
                        color: '#ff6b00'
                    }}
                >
                    Team Statistics
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    {[
                        {
                            label: 'Points Per Game',
                            home: match.homeTeam.pointsPerGame.toFixed(1),
                            away: match.awayTeam.pointsPerGame.toFixed(1)
                        },
                        {
                            label: 'Defensive Rating',
                            home: match.homeTeam.defensiveRating.toFixed(1),
                            away: match.awayTeam.defensiveRating.toFixed(1)
                        },
                        {
                            label: 'Offensive Rating',
                            home: match.homeTeam.offensiveRating.toFixed(1),
                            away: match.awayTeam.offensiveRating.toFixed(1)
                        },
                        {
                            label: 'Pace',
                            home: match.homeTeam.pace.toFixed(1),
                            away: match.awayTeam.pace.toFixed(1)
                        },
                        {
                            label: 'Home/Away Win Rate',
                            home: (match.homeTeam.homeWinRate * 100).toFixed(0) + '%',
                            away: (match.awayTeam.awayWinRate * 100).toFixed(0) + '%'
                        },
                        {
                            label: 'Form Score',
                            home: match.homeTeam.formScore.toFixed(2),
                            away: match.awayTeam.formScore.toFixed(2)
                        }
                    ].map((stat, idx) => (
                        <div
                            key={idx}
                            style={{
                                padding: '12px',
                                background: 'rgba(255, 107, 0, 0.03)',
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 107, 0, 0.1)'
                            }}
                        >
                            <div
                                style={{
                                    fontSize: '11px',
                                    color: '#888',
                                    marginBottom: '8px',
                                    textTransform: 'uppercase'
                                }}
                            >
                                {stat.label}
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: '14px'
                                }}
                            >
                                <span style={{ color: '#00ff9d', fontWeight: 700 }}>{stat.home}</span>
                                <span style={{ color: '#00b8ff', fontWeight: 700 }}>{stat.away}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
};