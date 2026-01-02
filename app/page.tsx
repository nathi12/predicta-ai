'use client';

import React, { useState, useMemo } from 'react';
import { Match, Prediction } from '@/types';
import { SportsAnalytics } from '@/lib/analytics';
import { useUpcomingMatches } from '@/hooks/useUpcomingMatches';
import { GlobalStyles } from '@/components/GlobalStyles';
import { Header } from '@/components/Header';
import { Filters } from '@/components/Filters';
import { MatchCard } from '@/components/MatchCard';
import { PredictionDisplay } from '@/components/PredictionDisplay';
import { Methodology, Disclaimer } from '@/components/MethodologyAndDisclaimer';


export default function SportsAnalyticsPlatform() {
  const { matches: allMatches, loading, error } = useUpcomingMatches();

  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [filterLeague, setFilterLeague] = useState<string>('all');

  // Extract unique leagues from football matches
  const leagues = useMemo(() => {
    const uniqueLeagues = new Set(
      allMatches
        .filter(m => m.sport === 'football')
        .map(m => m.league)
    );
    return ['all', ...Array.from(uniqueLeagues).sort()];
  }, [allMatches]);

  // Filter matches by league only (all matches are football now)
  const filteredMatches = useMemo(() => {
    if (filterLeague === 'all') return allMatches;
    return allMatches.filter(match => match.league === filterLeague);
  }, [allMatches, filterLeague]);


  const analyzeMatch = (match: Match) => {
    setSelectedMatch(match);
    const pred = SportsAnalytics.predictMatch(match.homeTeam, match.awayTeam);

    setPrediction({
      sport: 'football',
      match,
      predictedScore: pred.predictedScore,
      confidence: pred.confidence,
      winProbability: {
        home: pred.homeWin,
        draw: pred.draw,
        away: pred.awayWin
      },
      keyFactors: pred.insights,
      recommendation: pred.homeWin > 50
        ? `Strong home win predicted`
        : pred.awayWin > 50
          ? `Strong away win predicted`
          : `Close match expected`
    });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0f1419 100%)',
        color: '#e8eaed',
        fontFamily: '"Space Mono", monospace',
        overflow: 'auto'
      }}
    >
      <GlobalStyles />

      <Header />

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        {/* Error Display */}
        {error && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              color: '#fca5a5'
            }}
          >
            <p style={{ margin: 0, fontSize: '14px' }}>
              ⚠️ {error}. Showing sample data instead.
            </p>
          </div>
        )}

        {/* League Filter */}
        <Filters
          filterLeague={filterLeague}
          leagues={leagues}
          onLeagueChange={setFilterLeague}
        />

        {/* Loading State */}
        {loading && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '400px',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <div
              style={{
                width: '50px',
                height: '50px',
                border: '4px solid rgba(96, 165, 250, 0.2)',
                borderTop: '4px solid #60a5fa',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}
            />
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>
              Loading upcoming matches...
            </p>
          </div>
        )}

        {/* Matches Grid */}
        {!loading && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
              gap: '20px',
              marginBottom: '32px'
            }}
          >
            {filteredMatches.length === 0 ? (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: '60px 20px',
                  color: '#9ca3af'
                }}
              >
                <p style={{ fontSize: '18px', marginBottom: '8px' }}>
                  No matches found
                </p>
                <p style={{ fontSize: '14px' }}>
                  Try selecting a different league or check back later
                </p>
              </div>
            ) : (
              filteredMatches.map((match, idx) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  index={idx}
                  onAnalyze={analyzeMatch}
                />
              ))
            )}
          </div>
        )}

        {/* Prediction Display */}
        {prediction && selectedMatch && (
          <PredictionDisplay prediction={prediction} selectedMatch={selectedMatch} />
        )}

        {/* Methodology Section */}
        <Methodology />

        {/* Footer Disclaimer */}
        <Disclaimer />
      </div>

      {/* Add CSS for loading spinner */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}