import React from 'react';
import { Brain, BarChart3, Activity, Shield, AlertCircle } from 'lucide-react';

export const Methodology: React.FC = () => {
    return (
        <div
            style={{
                marginTop: '48px',
                padding: '32px',
                background: 'rgba(26, 31, 58, 0.6)',
                borderRadius: '16px',
                border: '1px solid rgba(0, 255, 157, 0.2)'
            }}
        >
            <h3
                style={{
                    fontSize: '20px',
                    marginBottom: '20px',
                    fontFamily: '"Orbitron", sans-serif',
                    fontWeight: 800
                }}
                className="gradient-text"
            >
                OUR METHODOLOGY
            </h3>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '20px'
                }}
            >
                {[
                    {
                        icon: <Brain size={24} />,
                        title: 'Machine Learning Models',
                        desc: 'Advanced algorithms analyze thousands of historical matches to identify patterns and trends'
                    },
                    {
                        icon: <BarChart3 size={24} />,
                        title: 'Statistical Analysis',
                        desc: 'Poisson distribution, Elo ratings, and regression models provide mathematical predictions'
                    },
                    {
                        icon: <Activity size={24} />,
                        title: 'Real-Time Data',
                        desc: 'Current form, injuries, head-to-head records, and performance metrics are continuously updated'
                    },
                    {
                        icon: <Shield size={24} />,
                        title: 'Risk Assessment',
                        desc: 'Confidence scores and probability ranges help identify value bets and manage expectations'
                    }
                ].map((item, idx) => (
                    <div
                        key={idx}
                        style={{
                            padding: '20px',
                            background: 'rgba(0, 255, 157, 0.05)',
                            borderRadius: '12px',
                            border: '1px solid rgba(0, 255, 157, 0.2)'
                        }}
                    >
                        <div style={{ color: '#00ff9d', marginBottom: '12px' }}>{item.icon}</div>
                        <h4
                            style={{
                                fontSize: '16px',
                                marginBottom: '8px',
                                fontWeight: 700,
                                color: '#e8eaed'
                            }}
                        >
                            {item.title}
                        </h4>
                        <p
                            style={{
                                margin: 0,
                                fontSize: '13px',
                                color: '#888',
                                lineHeight: '1.6'
                            }}
                        >
                            {item.desc}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const Disclaimer: React.FC = () => {
    return (
        <div
            style={{
                marginTop: '48px',
                padding: '24px',
                background: 'rgba(255, 107, 107, 0.1)',
                border: '2px solid rgba(255, 107, 107, 0.3)',
                borderRadius: '12px',
                textAlign: 'center'
            }}
        >
            <AlertCircle size={24} style={{ color: '#ff6b6b', marginBottom: '12px' }} />
            <h4
                style={{
                    margin: '0 0 12px 0',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#ff6b6b'
                }}
            >
                IMPORTANT DISCLAIMER
            </h4>
            <p
                style={{
                    fontSize: '13px',
                    color: '#e8eaed',
                    lineHeight: '1.6',
                    maxWidth: '800px',
                    margin: '0 auto'
                }}
            >
                PredictIQ provides analytical insights based on statistical models and AI
                predictions. These are probabilities, not guarantees. Sports betting carries
                inherent risk and you should never bet more than you can afford to lose. Our
                predictions are for informational and entertainment purposes only. Past
                performance does not guarantee future results. Please gamble responsibly.
            </p>
        </div>
    );
};