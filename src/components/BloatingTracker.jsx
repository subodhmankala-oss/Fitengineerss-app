import React, { useState } from 'react';
import './BloatingTracker.css';

const BloatingTracker = ({ setActiveTab }) => {
  const [bloatLevel, setBloatLevel] = useState(5);

  const getEmoji = () => {
    if (bloatLevel <= 3) return "😎";
    if (bloatLevel <= 7) return "🫤";
    return "🎈";
  };
  
  const getLabel = () => {
    if (bloatLevel <= 3) return "Flat as a board";
    if (bloatLevel <= 7) return "A bit uncomfortable";
    return "Full balloon mode";
  };

  // Calculate dynamic size based on bloat level (1 to 1.5 scale)
  const emojiScale = 1 + (bloatLevel / 10) * 0.8;

  return (
    <div className="bloating-tracker-container animate-slide-up">
      <div className="screen-header">
        <button className="back-btn" onClick={() => setActiveTab('home')}>
          <span className="icon">←</span> Back
        </button>
        <h1 className="screen-title">Bloating Tracker</h1>
        <p className="screen-subtitle">How's the gut feeling right now?</p>
      </div>
      
      <div className="tracker-card">
        <div className="emoji-display">
          <span 
            className="dynamic-emoji" 
            style={{ transform: `scale(${emojiScale})` }}
          >
            {getEmoji()}
          </span>
        </div>
        
        <h2 className="status-label">{getLabel()}</h2>
        
        <div className="custom-slider-wrapper">
          <input 
            type="range" 
            min="0" 
            max="10" 
            value={bloatLevel} 
            onChange={(e) => setBloatLevel(Number(e.target.value))} 
            className="custom-slider"
            style={{ backgroundSize: `${(bloatLevel / 10) * 100}% 100%` }}
          />
          <div className="slider-marks">
            <span>0</span>
            <span>5</span>
            <span>10</span>
          </div>
        </div>
      </div>
      
      <div className="action-footer">
        <button className="btn-primary full-width" onClick={() => setActiveTab('home')}>
          Save Log
        </button>
      </div>
    </div>
  );
};

export default BloatingTracker;
