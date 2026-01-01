import React from 'react';
import { SportFilter } from '@/types';

interface FiltersProps {
    filterSport: SportFilter;
    filterLeague: string;
    leagues: string[];
    onSportChange: (sport: SportFilter) => void;
    onLeagueChange: (league: string) => void;
}

export const Filters: React.FC<FiltersProps> = ({
    filterSport,
    filterLeague,
    leagues,
    onSportChange,
    onLeagueChange
}) => {
    return (
        <div style={{ marginBottom: '32px' }} className="animate-fade-in">
            <div
                style={{
                    display: 'flex',
                    gap: '16px',
                    flexWrap: 'wrap',
                    alignItems: 'center'
                }}
            >
                <span style={{ fontSize: '14px', color: '#00ff9d', fontWeight: 600 }}>
                    FILTER:
                </span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(['all', 'football', 'basketball'] as const).map((sport) => (
                        <button
                            key={sport}
                            onClick={() => onSportChange(sport)}
                            className={`filter-btn ${filterSport === sport ? 'active' : ''}`}
                        >
                            {sport === 'all'
                                ? 'All Sports'
                                : sport.charAt(0).toUpperCase() + sport.slice(1)}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {leagues.map((league) => (
                        <button
                            key={league}
                            onClick={() => onLeagueChange(league)}
                            className={`filter-btn ${filterLeague === league ? 'active' : ''}`}
                        >
                            {league === 'all' ? 'All Leagues' : league}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};