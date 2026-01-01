import React from 'react';
import { Target } from 'lucide-react';
import { Match } from '@/types';

interface MatchCardProps {
    match: Match;
    index: number;
    onAnalyze: (match: Match) => void;
}

export const MatchCard: React.FC<MatchCardProps> = ({ match, index, onAnalyze }) => {
    return (
        <div
            className="match-card card-hover animate-fade-in"
            onClick={() => onAnalyze(match)}
            style={{
                padding: '24px',
                animationDelay: `${index * 0.1}s`
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px'
                }}
            >
                <span className={`sport-badge ${match.sport}-badge`}>
                    {match.sport}
                </span>
                <span style={{ fontSize: '12px', color: '#888' }}>
                    {match.date} • {match.time}
                </span>
            </div>

            <div
                style={{
                    fontSize: '13px',
                    color: '#00ff9d',
                    marginBottom: '12px',
                    fontWeight: 600
                }}
            >
                {match.league}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}
                >
                    <span style={{ fontSize: '16px', fontWeight: 700 }}>
                        {match.homeTeam.name}
                    </span>
                    <span
                        style={{
                            background: 'rgba(0, 255, 157, 0.2)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#00ff9d'
                        }}
                    >
                        HOME
                    </span>
                </div>

                <div
                    style={{
                        height: '2px',
                        background: 'linear-gradient(90deg, #00ff9d 0%, #00b8ff 100%)',
                        margin: '4px 0'
                    }}
                />

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}
                >
                    <span style={{ fontSize: '16px', fontWeight: 700 }}>
                        {match.awayTeam.name}
                    </span>
                    <span
                        style={{
                            background: 'rgba(0, 184, 255, 0.2)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#00b8ff'
                        }}
                    >
                        AWAY
                    </span>
                </div>
            </div>

            <div
                style={{
                    marginTop: '16px',
                    padding: '12px',
                    background: 'rgba(0, 255, 157, 0.05)',
                    borderRadius: '8px',
                    border: '1px dashed rgba(0, 255, 157, 0.3)',
                    textAlign: 'center'
                }}
            >
                <Target size={20} style={{ color: '#00ff9d', marginBottom: '4px' }} />
                <div style={{ fontSize: '12px', color: '#888' }}>
                    Click to analyze with AI
                </div>
            </div>
        </div>
    );
};