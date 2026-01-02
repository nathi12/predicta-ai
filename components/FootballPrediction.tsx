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
    const homeTeam = match.homeTeam;
    const awayTeam = match.awayTeam;

    // Calculate derived stats from existing data
    const homeAvgGoals = homeTeam.goalsScored;
    const awayAvgGoals = awayTeam.goalsScored;
    const homeFormScore = homeTeam.wins / (homeTeam.wins + homeTeam.draws + homeTeam.losses);
    const awayFormScore = awayTeam.wins / (awayTeam.wins + awayTeam.draws + awayTeam.losses);
    const homeDefense = 100 - (homeTeam.goalsConceded * 10);
    const awayDefense = 100 - (awayTeam.goalsConceded * 10);
    const homeWinRate = homeTeam.wins / (homeTeam.wins + homeTeam.draws + homeTeam.losses);
    const awayWinRate = awayTeam.wins / (awayTeam.wins + awayTeam.draws + awayTeam.losses);

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
                                    home: homeAvgGoals * 20,
                                    away: awayAvgGoals * 20
                                },
                                {
                                    metric: 'Defense',
                                    home: Math.max(0, Math.min(100, homeDefense)),
                                    away: Math.max(0, Math.min(100, awayDefense))
                                },
                                {
                                    metric: 'Form',
                                    home: homeFormScore * 100,
                                    away: awayFormScore * 100
                                },
                                {
                                    metric: 'Shots',
                                    home: homeTeam.shotsPerGame * 5,
                                    away: awayTeam.shotsPerGame * 5
                                },
                                {
                                    metric: 'Possession',
                                    home: homeTeam.averagePossession,
                                    away: awayTeam.averagePossession
                                }
                            ]}
                        >
                            <PolarGrid stroke="rgba(255, 255, 255, 0.1)" />
                            <PolarAngleAxis dataKey="metric" tick={{ fill: '#888', fontSize: 12 }} />
                            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#888' }} />
                            <Radar
                                name={homeTeam.name}
                                dataKey="home"
                                stroke="#00ff9d"
                                fill="#00ff9d"
                                fillOpacity={0.3}
                            />
                            <Radar
                                name={awayTeam.name}
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
                            label: 'Goals Scored',
                            home: homeAvgGoals.toFixed(2),
                            away: awayAvgGoals.toFixed(2)
                        },
                        {
                            label: 'Form Score',
                            home: (homeFormScore * 100).toFixed(0) + '%',
                            away: (awayFormScore * 100).toFixed(0) + '%'
                        },
                        {
                            label: 'Shots Per Game',
                            home: homeTeam.shotsPerGame.toFixed(1),
                            away: awayTeam.shotsPerGame.toFixed(1)
                        },
                        {
                            label: 'Possession %',
                            home: homeTeam.averagePossession.toFixed(0) + '%',
                            away: awayTeam.averagePossession.toFixed(0) + '%'
                        },
                        {
                            label: 'Goals Conceded',
                            home: homeTeam.goalsConceded.toFixed(0),
                            away: awayTeam.goalsConceded.toFixed(0)
                        },
                        {
                            label: 'Win Rate',
                            home: (homeWinRate * 100).toFixed(0) + '%',
                            away: (awayWinRate * 100).toFixed(0) + '%'
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