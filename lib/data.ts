import { FootballMatch, BasketballMatch, Match } from '@/types';
import { generateBasketballTeam, generateFootballTeam } from './analytics';

// Sample Football Matches
export const sampleFootballMatches: FootballMatch[] = [
    {
        id: 1,
        sport: 'football',
        league: 'Premier League',
        homeTeam: generateFootballTeam('Manchester City', 'Premier League', 0.85),
        awayTeam: generateFootballTeam('Arsenal', 'Premier League', 0.78),
        date: '2025-01-02',
        time: '17:30'
    },
    {
        id: 2,
        sport: 'football',
        league: 'La Liga',
        homeTeam: generateFootballTeam('Real Madrid', 'La Liga', 0.82),
        awayTeam: generateFootballTeam('Barcelona', 'La Liga', 0.80),
        date: '2025-01-02',
        time: '20:00'
    },
    {
        id: 3,
        sport: 'football',
        league: 'Serie A',
        homeTeam: generateFootballTeam('Inter Milan', 'Serie A', 0.75),
        awayTeam: generateFootballTeam('AC Milan', 'Serie A', 0.70),
        date: '2025-01-03',
        time: '18:45'
    },
    {
        id: 4,
        sport: 'football',
        league: 'Bundesliga',
        homeTeam: generateFootballTeam('Bayern Munich', 'Bundesliga', 0.88),
        awayTeam: generateFootballTeam('Borussia Dortmund', 'Bundesliga', 0.72),
        date: '2025-01-03',
        time: '16:30'
    }
];

// Sample Basketball Matches
export const sampleBasketballMatches: BasketballMatch[] = [
    {
        id: 5,
        sport: 'basketball',
        league: 'NBA',
        homeTeam: generateBasketballTeam('LA Lakers', 'NBA', 0.75),
        awayTeam: generateBasketballTeam('Boston Celtics', 'NBA', 0.80),
        date: '2025-01-02',
        time: '22:00'
    },
    {
        id: 6,
        sport: 'basketball',
        league: 'NBA',
        homeTeam: generateBasketballTeam('Golden State Warriors', 'NBA', 0.78),
        awayTeam: generateBasketballTeam('Milwaukee Bucks', 'NBA', 0.76),
        date: '2025-01-03',
        time: '01:00'
    }
];

// All Matches Combined
export const allMatches: Match[] = [...sampleFootballMatches, ...sampleBasketballMatches];