import React from 'react';
import { Brain } from 'lucide-react';
import { Match, Prediction } from '@/types';
import { ConfidenceMeter } from './ConfidenceMeter';
import { FootballPredictionDisplay } from './FootballPrediction';
import { BasketballPredictionDisplay } from './BasketballPrediction';
import { AIExplanation } from './AIExplanation';
import { isFootballPrediction } from '@/lib/analytics';

interface PredictionDisplayProps {
    prediction: Prediction;
    selectedMatch: Match;
}

export const PredictionDisplay: React.FC<PredictionDisplayProps> = ({
    prediction,
    selectedMatch
}) => {
    return (
        <div
            className="animate-fade-in"
            style={{
                background:
                    'linear-gradient(135deg, rgba(26, 31, 58, 0.95) 0%, rgba(15, 20, 25, 0.98) 100%)',
                border: '2px solid #00ff9d',
                borderRadius: '20px',
                padding: '32px',
                marginTop: '32px',
                position: 'relative',
                overflow: 'hidden'
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, #00ff9d 0%, #00b8ff 50%, #ff00de 100%)'
                }}
                className="shimmer"
            />

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '24px'
                }}
            >
                <Brain size={32} style={{ color: '#00ff9d' }} className="animate-pulse" />
                <h2
                    style={{
                        margin: 0,
                        fontSize: '24px',
                        fontFamily: '"Orbitron", sans-serif',
                        fontWeight: 800
                    }}
                    className="gradient-text"
                >
                    AI PREDICTION ANALYSIS
                </h2>
            </div>

            {/* Match Info */}
            <div
                style={{
                    background: 'rgba(0, 255, 157, 0.05)',
                    padding: '20px',
                    borderRadius: '12px',
                    marginBottom: '24px',
                    border: '1px solid rgba(0, 255, 157, 0.2)'
                }}
            >
                <div
                    style={{
                        fontSize: '14px',
                        color: '#00ff9d',
                        marginBottom: '12px',
                        fontWeight: 600
                    }}
                >
                    {selectedMatch.league} • {selectedMatch.date} {selectedMatch.time}
                </div>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}
                >
                    <span style={{ fontSize: '20px', fontWeight: 700 }}>
                        {selectedMatch.homeTeam.name}
                    </span>
                    <span style={{ fontSize: '16px', color: '#888' }}>VS</span>
                    <span style={{ fontSize: '20px', fontWeight: 700 }}>
                        {selectedMatch.awayTeam.name}
                    </span>
                </div>
            </div>

            {/* Confidence Score */}
            <ConfidenceMeter confidence={prediction.confidence} />

            {/* Sport-Specific Predictions */}
            {isFootballPrediction(prediction) ? (
                <FootballPredictionDisplay prediction={prediction} />
            ) : (
                <BasketballPredictionDisplay prediction={prediction} />
            )}

            {/* AI Explanation */}
            <AIExplanation prediction={prediction} />
        </div>
    );
};