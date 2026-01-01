'use client';

import React, { useState } from 'react';
import { Match, Prediction, SportFilter } from '@/types';
import { SportsAnalytics } from '@/lib/analytics';
import { allMatches } from '@/lib/data';
import { GlobalStyles } from '@/components/GlobalStyles';
import { Header } from '@/components/Header';
import { Filters } from '@/components/Filters';
import { MatchCard } from '@/components/MatchCard';
import { PredictionDisplay } from '@/components/PredictionDisplay';
import { Methodology, Disclaimer } from '@/components/MethodologyAndDisclaimer';

export default function SportsAnalyticsPlatform() {
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [filterSport, setFilterSport] = useState<SportFilter>('all');
  const [filterLeague, setFilterLeague] = useState<string>('all');

  const leagues = ['all', ...new Set(allMatches.map((m) => m.league))];

  const filteredMatches = allMatches.filter((match) => {
    if (filterSport !== 'all' && match.sport !== filterSport) return false;
    if (filterLeague !== 'all' && match.league !== filterLeague) return false;
    return true;
  });

  const analyzeMatch = (match: Match) => {
    setSelectedMatch(match);

    if (match.sport === 'football') {
      const pred = SportsAnalytics.predictMatch(match.homeTeam, match.awayTeam);
      setPrediction({ ...pred, match });
    } else {
      const pred = SportsAnalytics.predictBasketball(match.homeTeam, match.awayTeam);
      setPrediction({ ...pred, match });
    }
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
        {/* Filters */}
        <Filters
          filterSport={filterSport}
          filterLeague={filterLeague}
          leagues={leagues}
          onSportChange={setFilterSport}
          onLeagueChange={setFilterLeague}
        />

        {/* Matches Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
            gap: '20px',
            marginBottom: '32px'
          }}
        >
          {filteredMatches.map((match, idx) => (
            <MatchCard
              key={match.id}
              match={match}
              index={idx}
              onAnalyze={analyzeMatch}
            />
          ))}
        </div>

        {/* Prediction Display */}
        {prediction && selectedMatch && (
          <PredictionDisplay prediction={prediction} selectedMatch={selectedMatch} />
        )}

        {/* Methodology Section */}
        <Methodology />

        {/* Footer Disclaimer */}
        <Disclaimer />
      </div>
    </div>
  );
}