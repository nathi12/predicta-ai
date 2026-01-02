'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Match, Prediction } from '@/types';
import { SportsAnalytics, BettingMarkets } from '@/lib/analytics';
import { useUpcomingMatches } from '@/hooks/useUpcomingMatches';
import { GlobalStyles } from '@/components/GlobalStyles';
import { Header } from '@/components/Header';
import { Filters } from '@/components/Filters';
import { Disclaimer } from '@/components/MethodologyAndDisclaimer';

export default function SportsAnalyticsPlatform() {
  const { matches: allMatches, loading, error } = useUpcomingMatches();

  const [filterLeague, setFilterLeague] = useState<string>('all');
  const [matchPredictions, setMatchPredictions] = useState<Map<string, Prediction>>(new Map());
  const [bettingMarkets, setBettingMarkets] = useState<Map<string, BettingMarkets>>(new Map());

  // Extract unique leagues from football matches
  const leagues = useMemo(() => {
    const uniqueLeagues = new Set(
      allMatches
        .filter(m => m.sport === 'football')
        .map(m => m.league)
    );
    return ['all', ...Array.from(uniqueLeagues).sort()];
  }, [allMatches]);

  // Filter matches by league
  const filteredMatches = useMemo(() => {
    if (filterLeague === 'all') return allMatches;
    return allMatches.filter(match => match.league === filterLeague);
  }, [allMatches, filterLeague]);

  // Generate predictions for all matches
  useEffect(() => {
    const predictions = new Map<string, Prediction>();
    const markets = new Map<string, BettingMarkets>();

    filteredMatches.forEach(match => {
      const pred = SportsAnalytics.predictMatch(match.homeTeam, match.awayTeam);

      predictions.set(match.id, {
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

      // Get betting markets from the prediction
      markets.set(match.id, pred.bettingMarkets);
    });

    setMatchPredictions(predictions);
    setBettingMarkets(markets);
  }, [filteredMatches]);

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

        {/* Matches Grid with Predictions */}
        {!loading && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))',
              gap: '24px',
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
              filteredMatches.map((match, idx) => {
                const prediction = matchPredictions.get(match.id);
                const markets = bettingMarkets.get(match.id);

                return (
                  <div
                    key={match.id}
                    style={{
                      background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)',
                      border: '1px solid rgba(96, 165, 250, 0.2)',
                      borderRadius: '16px',
                      padding: '24px',
                      boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
                      transition: 'all 0.3s ease',
                      animation: `fadeInUp 0.5s ease ${idx * 0.1}s backwards`
                    }}
                  >
                    {/* Match Header */}
                    <div style={{ marginBottom: '20px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '12px'
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#60a5fa',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            fontWeight: 600
                          }}
                        >
                          {match.league}
                        </span>
                        <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                          {new Date(match.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      {/* Teams */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '16px'
                        }}
                      >
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                            {match.homeTeam.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                            Form: {match.homeTeam.form || 'N/A'}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: '14px',
                            color: '#60a5fa',
                            fontWeight: 600,
                            padding: '4px 12px',
                            background: 'rgba(96, 165, 250, 0.1)',
                            borderRadius: '6px'
                          }}
                        >
                          VS
                        </div>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                            {match.awayTeam.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                            Form: {match.awayTeam.form || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* AI Prediction Section */}
                    {prediction && (
                      <div
                        style={{
                          background: 'rgba(96, 165, 250, 0.05)',
                          border: '1px solid rgba(96, 165, 250, 0.2)',
                          borderRadius: '12px',
                          padding: '16px',
                          marginTop: '16px'
                        }}
                      >
                        {/* Predicted Score */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '16px',
                            marginBottom: '16px',
                            paddingBottom: '16px',
                            borderBottom: '1px solid rgba(96, 165, 250, 0.1)'
                          }}
                        >
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
                              PREDICTED SCORE
                            </div>
                            <div
                              style={{
                                fontSize: '28px',
                                fontWeight: 700,
                                background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text'
                              }}
                            >
                              {prediction.predictedScore.home} - {prediction.predictedScore.away}
                            </div>
                          </div>
                        </div>

                        {/* Win Probabilities */}
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            Win Probability
                          </div>
                          <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                            <div style={{ flex: 1, textAlign: 'center', padding: '8px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                              <div style={{ color: '#4ade80', fontWeight: 600 }}>
                                {prediction.winProbability.home.toFixed(1)}%
                              </div>
                              <div style={{ color: '#9ca3af', fontSize: '10px', marginTop: '2px' }}>
                                HOME
                              </div>
                            </div>
                            <div style={{ flex: 1, textAlign: 'center', padding: '8px', background: 'rgba(250, 204, 21, 0.1)', borderRadius: '6px', border: '1px solid rgba(250, 204, 21, 0.2)' }}>
                              <div style={{ color: '#facc15', fontWeight: 600 }}>
                                {prediction.winProbability.draw.toFixed(1)}%
                              </div>
                              <div style={{ color: '#9ca3af', fontSize: '10px', marginTop: '2px' }}>
                                DRAW
                              </div>
                            </div>
                            <div style={{ flex: 1, textAlign: 'center', padding: '8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                              <div style={{ color: '#ef4444', fontWeight: 600 }}>
                                {prediction.winProbability.away.toFixed(1)}%
                              </div>
                              <div style={{ color: '#9ca3af', fontSize: '10px', marginTop: '2px' }}>
                                AWAY
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Confidence */}
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>
                              Confidence
                            </span>
                            <span style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 600 }}>
                              {prediction.confidence.toFixed(1)}%
                            </span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(96, 165, 250, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${prediction.confidence}%`,
                                background: 'linear-gradient(90deg, #60a5fa 0%, #a78bfa 100%)',
                                borderRadius: '3px',
                                transition: 'width 0.5s ease'
                              }}
                            />
                          </div>
                        </div>

                        {/* Betting Markets - Goals */}
                        {markets && (
                          <>
                            <div style={{ marginBottom: '16px' }}>
                              <div style={{
                                fontSize: '11px',
                                color: '#9ca3af',
                                marginBottom: '10px',
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                                fontWeight: 600
                              }}>
                                ⚽ Goals Markets
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                                <div style={{
                                  padding: '10px',
                                  background: markets.over15Goals.recommended ? 'rgba(34, 197, 94, 0.15)' : 'rgba(96, 165, 250, 0.05)',
                                  borderRadius: '8px',
                                  border: `1px solid ${markets.over15Goals.recommended ? 'rgba(34, 197, 94, 0.3)' : 'rgba(96, 165, 250, 0.15)'}`,
                                  position: 'relative'
                                }}>
                                  {markets.over15Goals.recommended && (
                                    <div style={{
                                      position: 'absolute',
                                      top: '4px',
                                      right: '4px',
                                      fontSize: '10px',
                                      background: 'rgba(34, 197, 94, 0.2)',
                                      color: '#4ade80',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontWeight: 600
                                    }}>
                                      ⭐
                                    </div>
                                  )}
                                  <div style={{ color: '#9ca3af', fontSize: '10px', marginBottom: '4px' }}>
                                    Over 1.5 Goals
                                  </div>
                                  <div style={{
                                    color: markets.over15Goals.recommended ? '#4ade80' : '#60a5fa',
                                    fontWeight: 600,
                                    fontSize: '14px'
                                  }}>
                                    {markets.over15Goals.probability.toFixed(1)}%
                                  </div>
                                </div>

                                <div style={{
                                  padding: '10px',
                                  background: markets.over25Goals.recommended ? 'rgba(34, 197, 94, 0.15)' : 'rgba(96, 165, 250, 0.05)',
                                  borderRadius: '8px',
                                  border: `1px solid ${markets.over25Goals.recommended ? 'rgba(34, 197, 94, 0.3)' : 'rgba(96, 165, 250, 0.15)'}`,
                                  position: 'relative'
                                }}>
                                  {markets.over25Goals.recommended && (
                                    <div style={{
                                      position: 'absolute',
                                      top: '4px',
                                      right: '4px',
                                      fontSize: '10px',
                                      background: 'rgba(34, 197, 94, 0.2)',
                                      color: '#4ade80',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontWeight: 600
                                    }}>
                                      ⭐
                                    </div>
                                  )}
                                  <div style={{ color: '#9ca3af', fontSize: '10px', marginBottom: '4px' }}>
                                    Over 2.5 Goals
                                  </div>
                                  <div style={{
                                    color: markets.over25Goals.recommended ? '#4ade80' : '#60a5fa',
                                    fontWeight: 600,
                                    fontSize: '14px'
                                  }}>
                                    {markets.over25Goals.probability.toFixed(1)}%
                                  </div>
                                </div>

                                <div style={{
                                  padding: '10px',
                                  background: markets.over35Goals.recommended ? 'rgba(34, 197, 94, 0.15)' : 'rgba(96, 165, 250, 0.05)',
                                  borderRadius: '8px',
                                  border: `1px solid ${markets.over35Goals.recommended ? 'rgba(34, 197, 94, 0.3)' : 'rgba(96, 165, 250, 0.15)'}`,
                                  position: 'relative'
                                }}>
                                  {markets.over35Goals.recommended && (
                                    <div style={{
                                      position: 'absolute',
                                      top: '4px',
                                      right: '4px',
                                      fontSize: '10px',
                                      background: 'rgba(34, 197, 94, 0.2)',
                                      color: '#4ade80',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontWeight: 600
                                    }}>
                                      ⭐
                                    </div>
                                  )}
                                  <div style={{ color: '#9ca3af', fontSize: '10px', marginBottom: '4px' }}>
                                    Over 3.5 Goals
                                  </div>
                                  <div style={{
                                    color: markets.over35Goals.recommended ? '#4ade80' : '#60a5fa',
                                    fontWeight: 600,
                                    fontSize: '14px'
                                  }}>
                                    {markets.over35Goals.probability.toFixed(1)}%
                                  </div>
                                </div>

                                <div style={{
                                  padding: '10px',
                                  background: markets.btts.recommended ? 'rgba(34, 197, 94, 0.15)' : 'rgba(96, 165, 250, 0.05)',
                                  borderRadius: '8px',
                                  border: `1px solid ${markets.btts.recommended ? 'rgba(34, 197, 94, 0.3)' : 'rgba(96, 165, 250, 0.15)'}`,
                                  position: 'relative'
                                }}>
                                  {markets.btts.recommended && (
                                    <div style={{
                                      position: 'absolute',
                                      top: '4px',
                                      right: '4px',
                                      fontSize: '10px',
                                      background: 'rgba(34, 197, 94, 0.2)',
                                      color: '#4ade80',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontWeight: 600
                                    }}>
                                      ⭐
                                    </div>
                                  )}
                                  <div style={{ color: '#9ca3af', fontSize: '10px', marginBottom: '4px' }}>
                                    Both Teams Score
                                  </div>
                                  <div style={{
                                    color: markets.btts.recommended ? '#4ade80' : '#60a5fa',
                                    fontWeight: 600,
                                    fontSize: '14px'
                                  }}>
                                    {markets.btts.probability.toFixed(1)}%
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Betting Markets - Corners */}
                            <div style={{ marginBottom: '12px' }}>
                              <div style={{
                                fontSize: '11px',
                                color: '#9ca3af',
                                marginBottom: '10px',
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                                fontWeight: 600
                              }}>
                                🚩 Corners Markets
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '11px' }}>
                                <div style={{
                                  padding: '10px',
                                  background: markets.corners.over65.recommended ? 'rgba(34, 197, 94, 0.15)' : 'rgba(96, 165, 250, 0.05)',
                                  borderRadius: '8px',
                                  border: `1px solid ${markets.corners.over65.recommended ? 'rgba(34, 197, 94, 0.3)' : 'rgba(96, 165, 250, 0.15)'}`,
                                  position: 'relative'
                                }}>
                                  {markets.corners.over65.recommended && (
                                    <div style={{
                                      position: 'absolute',
                                      top: '4px',
                                      right: '4px',
                                      fontSize: '10px',
                                      background: 'rgba(34, 197, 94, 0.2)',
                                      color: '#4ade80',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontWeight: 600
                                    }}>
                                      ⭐
                                    </div>
                                  )}
                                  <div style={{ color: '#9ca3af', fontSize: '10px', marginBottom: '4px' }}>
                                    Over 6.5
                                  </div>
                                  <div style={{
                                    color: markets.corners.over65.recommended ? '#4ade80' : '#60a5fa',
                                    fontWeight: 600,
                                    fontSize: '14px'
                                  }}>
                                    {markets.corners.over65.probability.toFixed(1)}%
                                  </div>
                                </div>

                                <div style={{
                                  padding: '10px',
                                  background: markets.corners.over85.recommended ? 'rgba(34, 197, 94, 0.15)' : 'rgba(96, 165, 250, 0.05)',
                                  borderRadius: '8px',
                                  border: `1px solid ${markets.corners.over85.recommended ? 'rgba(34, 197, 94, 0.3)' : 'rgba(96, 165, 250, 0.15)'}`,
                                  position: 'relative'
                                }}>
                                  {markets.corners.over85.recommended && (
                                    <div style={{
                                      position: 'absolute',
                                      top: '4px',
                                      right: '4px',
                                      fontSize: '10px',
                                      background: 'rgba(34, 197, 94, 0.2)',
                                      color: '#4ade80',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontWeight: 600
                                    }}>
                                      ⭐
                                    </div>
                                  )}
                                  <div style={{ color: '#9ca3af', fontSize: '10px', marginBottom: '4px' }}>
                                    Over 8.5
                                  </div>
                                  <div style={{
                                    color: markets.corners.over85.recommended ? '#4ade80' : '#60a5fa',
                                    fontWeight: 600,
                                    fontSize: '14px'
                                  }}>
                                    {markets.corners.over85.probability.toFixed(1)}%
                                  </div>
                                </div>

                                <div style={{
                                  padding: '10px',
                                  background: markets.corners.over105.recommended ? 'rgba(34, 197, 94, 0.15)' : 'rgba(96, 165, 250, 0.05)',
                                  borderRadius: '8px',
                                  border: `1px solid ${markets.corners.over105.recommended ? 'rgba(34, 197, 94, 0.3)' : 'rgba(96, 165, 250, 0.15)'}`,
                                  position: 'relative'
                                }}>
                                  {markets.corners.over105.recommended && (
                                    <div style={{
                                      position: 'absolute',
                                      top: '4px',
                                      right: '4px',
                                      fontSize: '10px',
                                      background: 'rgba(34, 197, 94, 0.2)',
                                      color: '#4ade80',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontWeight: 600
                                    }}>
                                      ⭐
                                    </div>
                                  )}
                                  <div style={{ color: '#9ca3af', fontSize: '10px', marginBottom: '4px' }}>
                                    Over 10.5
                                  </div>
                                  <div style={{
                                    color: markets.corners.over105.recommended ? '#4ade80' : '#60a5fa',
                                    fontWeight: 600,
                                    fontSize: '14px'
                                  }}>
                                    {markets.corners.over105.probability.toFixed(1)}%
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        {/* Recommendation */}
                        <div
                          style={{
                            background: 'rgba(168, 85, 247, 0.1)',
                            border: '1px solid rgba(168, 85, 247, 0.2)',
                            borderRadius: '8px',
                            padding: '10px',
                            fontSize: '12px',
                            color: '#c084fc',
                            textAlign: 'center',
                            fontWeight: 500
                          }}
                        >
                          💡 {prediction.recommendation}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Footer Disclaimer */}
        <Disclaimer />
      </div>

      {/* Animations */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}