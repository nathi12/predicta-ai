import React from 'react';
import { Prediction, Match } from '@/types';

interface PredictionDisplayProps {
    prediction: Prediction;
    selectedMatch: Match;
}

export function PredictionDisplay({ prediction, selectedMatch }: PredictionDisplayProps) {
    // Remove the validation that's causing the error
    // The prediction is already typed correctly as Prediction which includes sport: 'football'

    return (
        <div
            style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
                border: '2px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '16px',
                padding: '32px',
                marginBottom: '32px',
                animation: 'fadeIn 0.5s ease-in'
            }}
        >
            {/* Header */}
            <div style={{ marginBottom: '32px' }}>
                <h2
                    style={{
                        fontSize: '28px',
                        fontWeight: 'bold',
                        marginBottom: '12px',
                        background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text'
                    }}
                >
                    AI Prediction Analysis
                </h2>
                <p style={{ color: '#9ca3af', fontSize: '14px' }}>
                    {selectedMatch.homeTeam.name} vs {selectedMatch.awayTeam.name}
                </p>
            </div>

            {/* Predicted Score */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '24px',
                    marginBottom: '32px',
                    padding: '24px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '12px'
                }}
            >
                <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px' }}>
                        {selectedMatch.homeTeam.name}
                    </p>
                    <p
                        style={{
                            fontSize: '48px',
                            fontWeight: 'bold',
                            color: '#10b981'
                        }}
                    >
                        {prediction.predictedScore.home}
                    </p>
                </div>
                <p style={{ fontSize: '32px', color: '#6b7280' }}>-</p>
                <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px' }}>
                        {selectedMatch.awayTeam.name}
                    </p>
                    <p
                        style={{
                            fontSize: '48px',
                            fontWeight: 'bold',
                            color: '#3b82f6'
                        }}
                    >
                        {prediction.predictedScore.away}
                    </p>
                </div>
            </div>

            {/* Win Probabilities */}
            <div style={{ marginBottom: '32px' }}>
                <h3
                    style={{
                        fontSize: '18px',
                        fontWeight: 'bold',
                        marginBottom: '16px',
                        color: '#e8eaed'
                    }}
                >
                    Win Probabilities
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    {/* Home Win */}
                    <div
                        style={{
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: '8px',
                            padding: '16px',
                            textAlign: 'center'
                        }}
                    >
                        <p style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px' }}>
                            Home Win
                        </p>
                        <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
                            {prediction.winProbability.home.toFixed(1)}%
                        </p>
                    </div>

                    {/* Draw */}
                    <div
                        style={{
                            background: 'rgba(251, 191, 36, 0.1)',
                            border: '1px solid rgba(251, 191, 36, 0.3)',
                            borderRadius: '8px',
                            padding: '16px',
                            textAlign: 'center'
                        }}
                    >
                        <p style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px' }}>
                            Draw
                        </p>
                        <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#fbbf24' }}>
                            {prediction.winProbability.draw.toFixed(1)}%
                        </p>
                    </div>

                    {/* Away Win */}
                    <div
                        style={{
                            background: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            borderRadius: '8px',
                            padding: '16px',
                            textAlign: 'center'
                        }}
                    >
                        <p style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '8px' }}>
                            Away Win
                        </p>
                        <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>
                            {prediction.winProbability.away.toFixed(1)}%
                        </p>
                    </div>
                </div>
            </div>

            {/* Confidence */}
            <div
                style={{
                    marginBottom: '32px',
                    padding: '20px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '12px'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', color: '#9ca3af' }}>Confidence Level</span>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#10b981' }}>
                        {prediction.confidence}%
                    </span>
                </div>
                <div
                    style={{
                        width: '100%',
                        height: '8px',
                        background: 'rgba(107, 114, 128, 0.3)',
                        borderRadius: '4px',
                        overflow: 'hidden'
                    }}
                >
                    <div
                        style={{
                            width: `${prediction.confidence}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #10b981 0%, #3b82f6 100%)',
                            borderRadius: '4px',
                            transition: 'width 0.5s ease-in-out'
                        }}
                    />
                </div>
            </div>

            {/* Key Factors */}
            <div style={{ marginBottom: '24px' }}>
                <h3
                    style={{
                        fontSize: '18px',
                        fontWeight: 'bold',
                        marginBottom: '16px',
                        color: '#e8eaed'
                    }}
                >
                    Key Factors
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {prediction.keyFactors.map((factor, index) => (
                        <li
                            key={index}
                            style={{
                                padding: '12px',
                                marginBottom: '8px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                borderRadius: '8px',
                                borderLeft: '3px solid #10b981',
                                fontSize: '14px',
                                color: '#d1d5db'
                            }}
                        >
                            • {factor}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Recommendation */}
            <div
                style={{
                    padding: '20px',
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)',
                    borderRadius: '12px',
                    border: '1px solid rgba(16, 185, 129, 0.3)'
                }}
            >
                <p style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '8px' }}>
                    Recommendation
                </p>
                <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>
                    {prediction.recommendation}
                </p>
            </div>
        </div>
    );
}