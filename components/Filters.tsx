// components/Filters.tsx

import React from 'react';

interface FiltersProps {
    filterLeague: string;
    leagues: string[];
    onLeagueChange: (league: string) => void;
}

export function Filters({ filterLeague, leagues, onLeagueChange }: FiltersProps) {
    return (
        <div
            style={{
                display: 'flex',
                gap: '16px',
                marginBottom: '32px',
                flexWrap: 'wrap',
                alignItems: 'center'
            }}
        >
            <div style={{ flex: '1', minWidth: '200px' }}>
                <label
                    htmlFor="league-filter"
                    style={{
                        display: 'block',
                        marginBottom: '8px',
                        fontSize: '14px',
                        color: '#9ca3af',
                        fontWeight: 500
                    }}
                >
                    Filter by League
                </label>
                <select
                    id="league-filter"
                    value={filterLeague}
                    onChange={(e) => onLeagueChange(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: 'rgba(30, 41, 59, 0.5)',
                        border: '1px solid rgba(96, 165, 250, 0.3)',
                        borderRadius: '8px',
                        color: '#e8eaed',
                        fontSize: '14px',
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'all 0.3s ease'
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.6)';
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.7)';
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.3)';
                        e.currentTarget.style.background = 'rgba(30, 41, 59, 0.5)';
                    }}
                >
                    {leagues.map((league) => (
                        <option
                            key={league}
                            value={league}
                            style={{
                                background: '#1e293b',
                                color: '#e8eaed'
                            }}
                        >
                            {league === 'all' ? 'All Leagues' : league}
                        </option>
                    ))}
                </select>
            </div>

            {filterLeague !== 'all' && (
                <button
                    onClick={() => onLeagueChange('all')}
                    style={{
                        marginTop: '28px',
                        padding: '12px 20px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        color: '#fca5a5',
                        fontSize: '14px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    }}
                >
                    Clear Filter
                </button>
            )}
        </div>
    );
}