import React from 'react';
import { Zap } from 'lucide-react';

interface ConfidenceMeterProps {
    confidence: number;
}

export const ConfidenceMeter: React.FC<ConfidenceMeterProps> = ({ confidence }) => {
    return (
        <div className="stat-card" style={{ marginBottom: '24px' }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Zap size={20} style={{ color: '#ffd93d' }} />
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>
                        Prediction Confidence
                    </span>
                </div>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#00ff9d' }}>
                    {confidence.toFixed(1)}%
                </span>
            </div>
            <div className="confidence-meter">
                <div className="confidence-fill" style={{ width: `${confidence}%` }} />
            </div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
                Based on data quality, form consistency, and statistical models
            </div>
        </div>
    );
};