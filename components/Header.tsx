import React from 'react';
import { Brain, AlertCircle } from 'lucide-react';

export const Header: React.FC = () => {
    return (
        <header
            style={{
                padding: '24px 32px',
                borderBottom: '1px solid rgba(0, 255, 157, 0.2)',
                background: 'rgba(10, 14, 39, 0.8)',
                backdropFilter: 'blur(10px)',
                position: 'sticky',
                top: 0,
                zIndex: 100
            }}
            className="animate-slide-in"
        >
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '16px'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Brain size={36} style={{ color: '#00ff9d' }} />
                        <div>
                            <h1
                                style={{
                                    margin: 0,
                                    fontSize: '28px',
                                    fontFamily: '"Orbitron", sans-serif',
                                    fontWeight: 800,
                                    letterSpacing: '2px'
                                }}
                                className="gradient-text"
                            >
                                PREDICTA AI
                            </h1>
                            <p
                                style={{
                                    margin: 0,
                                    fontSize: '11px',
                                    color: '#00ff9d',
                                    textTransform: 'uppercase',
                                    letterSpacing: '2px',
                                    fontWeight: 600
                                }}
                            >
                                AI Sports Analytics
                            </p>
                        </div>
                    </div>
                    <div
                        style={{
                            background: 'rgba(255, 107, 107, 0.15)',
                            border: '1px solid rgba(255, 107, 107, 0.4)',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <AlertCircle size={16} style={{ color: '#ff6b6b' }} />
                        <span style={{ fontSize: '12px', color: '#ff6b6b' }}>
                            For analytical insights only. Betting carries risk.
                        </span>
                    </div>
                </div>
            </div>
        </header>
    );
};