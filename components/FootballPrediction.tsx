import React from 'react';
import {
    RadarChart,
    Radar,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { FootballPrediction } from '@/types';

interface FootballPredictionDisplayProps {
    prediction: FootballPrediction;
}

export const FootballPredictionDisplay: React.FC<FootballPredictionDisplayProps> = ({
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
                        color: '#00ff9d'
                    }}
                >
                    Match Result Probabilities
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    {[
                        { label: 'Home Win', prob: prediction.homeWin, color: '#00ff9d' },
                        { label: 'Draw', prob: prediction.draw, color: '#ffd93d' },
                        { label: 'Away Win', prob: prediction.awayWin, color: '#00b8ff' }
                    ].map((outcome, idx) => (
                        <div
                            key={idx}
                            style={{
                                textAlign: 'center',
                                padding: '16px',
                                background: `rgba(${outcome.color === '#00ff9d'
                                    ? '0, 255, 157'
                                    : outcome.color === '#ffd93d'
                                        ? '255, 217, 61'
                                        : '0, 184, 255'
                                    }, 0.1)`,
                                borderRadius: '12px',
                                border: `1px solid ${outcome.color}40`
                            }}
                        >
                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                                {outcome.label}
                            </div>
                            <div
                                style={{
                                    fontSize: '28px',
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

            {/* Betting Markets */}
            <div className="stat-card" style={{ marginBottom: '24px' }}>
                <h3
                    style={{
                        fontSize: '16px',
                        marginBottom: '16px',
                        fontWeight: 700,
                        color: '#00ff9d'
                    }}
                >
                    Betway Market Insights
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div
                        style={{
                            padding: '16px',
                            background: 'rgba(0, 255, 157, 0.05)',
                            borderRadius: '12px',
                            border: '1px solid rgba(0, 255, 157, 0.2)'
                        }}
                    >
                        <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>
                            Over 2.5 Goals
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#00ff9d' }}>
                            {(prediction.over25 * 100).toFixed(1)}%
                        </div>
                        {prediction.over25 > 0.6 && (
                            <span className="value-badge" style={{ marginTop: '8px' }}>
                                VALUE BET
                            </span>
                        )}
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
                            Both Teams to Score
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#00b8ff' }}>
                            {(prediction.btts * 100).toFixed(1)}%
                        </div>
                        {prediction.btts > 0.65 && (
                            <span className="value-badge" style={{ marginTop: '8px' }}>
                                VALUE BET
                            </span>
                        )}
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
                            Expected Total Goals
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#ffd93d' }}>
                            {prediction.expectedGoals.toFixed(2)}
                        </div>
                    </div>

                    <div
                        style={{
                            padding: '16px',
                            background: 'rgba(255, 0, 222, 0.05)',
                            borderRadius: '12px',
                            border: '1px solid rgba(255, 0, 222, 0.2)'
                        }}
                    >
                        <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>
                            Double Chance (1X)
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#ff00de' }}>
                            {((prediction.homeWin + prediction.draw) * 100).toFixed(1)}%
                        </div>
                    </div>
                </div>
            </div>

            {/* Team Comparison */}
            <div className="stat-card" style={{ marginBottom: '24px' }}>
                <h3
                    style={{
                        fontSize: '16px',
                        marginBottom: '20px',
                        fontWeight: 700,
                        color: '#00ff9d'
                    }}
                >
                    Team Performance Comparison
                </h3>

                <div className="radar-chart-container">
                    <ResponsiveContainer width="100%" height={300}>
                        <RadarChart
                            data={[
                                {
                                    metric: 'Attack',
                                    home: match.homeTeam.avgGoalsScored * 20,
                                    away: match.awayTeam.avgGoalsScored * 20
                                },
                                {
                                    metric: 'Defense',
                                    home: match.homeTeam.defensiveStrength,
                                    away: match.awayTeam.defensiveStrength
                                },
                                {
                                    metric: 'Form',
                                    home: match.homeTeam.formScore * 33.33,
                                    away: match.awayTeam.formScore * 33.33
                                },
                                {
                                    metric: 'xG',
                                    home: match.homeTeam.xG * 20,
                                    away: match.awayTeam.xG * 20
                                },
                                {
                                    metric: 'Possession',
                                    home: match.homeTeam.possession,
                                    away: match.awayTeam.possession
                                }
                            ]}
                        >
                            <PolarGrid stroke="rgba(255, 255, 255, 0.1)" />
                            <PolarAngleAxis dataKey="metric" tick={{ fill: '#888', fontSize: 12 }} />
                            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#888' }} />
                            <Radar
                                name={match.homeTeam.name}
                                dataKey="home"
                                stroke="#00ff9d"
                                fill="#00ff9d"
                                fillOpacity={0.3}
                            />
                            <Radar
                                name={match.awayTeam.name}
                                dataKey="away"
                                stroke="#00b8ff"
                                fill="#00b8ff"
                                fillOpacity={0.3}
                            />
                            <Legend wrapperStyle={{ color: '#e8eaed' }} />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Statistical Breakdown */}
            <div className="stat-card">
                <h3
                    style={{
                        fontSize: '16px',
                        marginBottom: '16px',
                        fontWeight: 700,
                        color: '#00ff9d'
                    }}
                >
                    Key Statistics
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    {[
                        {
                            label: 'Avg Goals Scored',
                            home: match.homeTeam.avgGoalsScored.toFixed(2),
                            away: match.awayTeam.avgGoalsScored.toFixed(2)
                        },
                        {
                            label: 'Form Score',
                            home: match.homeTeam.formScore.toFixed(2),
                            away: match.awayTeam.formScore.toFixed(2)
                        },
                        {
                            label: 'Expected Goals (xG)',
                            home: match.homeTeam.xG.toFixed(2),
                            away: match.awayTeam.xG.toFixed(2)
                        },
                        {
                            label: 'Possession %',
                            home: match.homeTeam.possession.toFixed(0) + '%',
                            away: match.awayTeam.possession.toFixed(0) + '%'
                        },
                        {
                            label: 'Defensive Strength',
                            home: match.homeTeam.defensiveStrength.toFixed(0),
                            away: match.awayTeam.defensiveStrength.toFixed(0)
                        },
                        {
                            label: 'Home/Away Win Rate',
                            home: (match.homeTeam.homeWinRate * 100).toFixed(0) + '%',
                            away: (match.awayTeam.awayWinRate * 100).toFixed(0) + '%'
                        }
                    ].map((stat, idx) => (
                        <div
                            key={idx}
                            style={{
                                padding: '12px',
                                background: 'rgba(0, 255, 157, 0.03)',
                                borderRadius: '8px',
                                border: '1px solid rgba(0, 255, 157, 0.1)'
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