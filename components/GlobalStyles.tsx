import React from 'react';

export const GlobalStyles: React.FC = () => {
    return (
        <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Orbitron:wght@600;800&display=swap');
      
      @keyframes slideInDown {
        from {
          opacity: 0;
          transform: translateY(-30px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
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

      @keyframes pulse {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.6;
        }
      }

      @keyframes shimmer {
        0% {
          background-position: -1000px 0;
        }
        100% {
          background-position: 1000px 0;
        }
      }

      .animate-slide-in {
        animation: slideInDown 0.6s ease-out;
      }

      .animate-fade-in {
        animation: fadeInUp 0.8s ease-out;
      }

      .animate-pulse {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      .card-hover {
        transition: all 0.3s ease;
        cursor: pointer;
      }

      .card-hover:hover {
        transform: translateY(-4px);
        box-shadow: 0 20px 40px rgba(0, 255, 157, 0.2);
      }

      .gradient-text {
        background: linear-gradient(135deg, #00ff9d 0%, #00b8ff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .glow-effect {
        box-shadow: 0 0 20px rgba(0, 255, 157, 0.3);
      }

      .shimmer {
        background: linear-gradient(90deg, transparent, rgba(0, 255, 157, 0.2), transparent);
        background-size: 1000px 100%;
        animation: shimmer 2s infinite;
      }

      .stat-card {
        background: rgba(26, 31, 58, 0.6);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(0, 255, 157, 0.2);
        border-radius: 12px;
        padding: 20px;
        transition: all 0.3s ease;
      }

      .stat-card:hover {
        border-color: rgba(0, 255, 157, 0.5);
        background: rgba(26, 31, 58, 0.8);
      }

      .prob-bar {
        height: 8px;
        border-radius: 4px;
        background: linear-gradient(90deg, #00ff9d 0%, #00b8ff 100%);
        transition: width 0.6s ease;
      }

      .match-card {
        background: linear-gradient(135deg, rgba(26, 31, 58, 0.8) 0%, rgba(15, 20, 25, 0.9) 100%);
        border: 1px solid rgba(0, 255, 157, 0.15);
        border-radius: 16px;
        overflow: hidden;
        position: relative;
      }

      .match-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, #00ff9d 0%, #00b8ff 50%, #ff00de 100%);
      }

      .value-badge {
        background: linear-gradient(135deg, #00ff9d 0%, #00d9ff 100%);
        color: #0a0e27;
        font-weight: bold;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        display: inline-block;
        animation: pulse 2s infinite;
      }

      .confidence-meter {
        position: relative;
        height: 12px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        overflow: hidden;
      }

      .confidence-fill {
        height: 100%;
        background: linear-gradient(90deg, #ff6b6b 0%, #ffd93d 50%, #00ff9d 100%);
        border-radius: 6px;
        transition: width 0.8s ease;
      }

      .sport-badge {
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .football-badge {
        background: rgba(0, 255, 157, 0.2);
        color: #00ff9d;
        border: 1px solid #00ff9d;
      }

      .basketball-badge {
        background: rgba(255, 107, 0, 0.2);
        color: #ff6b00;
        border: 1px solid #ff6b00;
      }

      .filter-btn {
        background: rgba(26, 31, 58, 0.6);
        border: 1px solid rgba(0, 255, 157, 0.2);
        color: #e8eaed;
        padding: 8px 16px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s ease;
        font-family: 'Space Mono', monospace;
        font-size: 13px;
      }

      .filter-btn:hover {
        border-color: #00ff9d;
        background: rgba(0, 255, 157, 0.1);
      }

      .filter-btn.active {
        background: linear-gradient(135deg, #00ff9d 0%, #00b8ff 100%);
        color: #0a0e27;
        border-color: transparent;
        font-weight: bold;
      }

      .radar-chart-container {
        background: rgba(26, 31, 58, 0.4);
        border-radius: 12px;
        padding: 20px;
        border: 1px solid rgba(0, 255, 157, 0.1);
      }
    `}</style>
    );
};