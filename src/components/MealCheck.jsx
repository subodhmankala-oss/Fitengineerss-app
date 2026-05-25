import React, { useState } from 'react';
import './MealCheck.css';

const MealCheck = ({ setActiveTab }) => {
  const [uploaded, setUploaded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const handleUpload = () => {
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      setUploaded(true);
    }, 1500); // Simulate AI analysis delay
  };

  return (
    <div className="meal-check-container animate-slide-up">
      <div className="screen-header">
        <button className="back-btn" onClick={() => setActiveTab('home')}>
          <span className="icon">←</span> Back
        </button>
        <h1 className="screen-title">Meal Check</h1>
        <p className="screen-subtitle">Let's see what you're eating.</p>
      </div>
      
      {!uploaded ? (
        <div className="upload-section">
          <div className="camera-viewfinder" onClick={handleUpload}>
            <div className="corner top-left"></div>
            <div className="corner top-right"></div>
            <div className="corner bottom-left"></div>
            <div className="corner bottom-right"></div>
            
            {analyzing ? (
              <div className="analyzing-state">
                <div className="spinner"></div>
                <p>Analyzing meal...</p>
              </div>
            ) : (
              <div className="ready-state">
                <span className="camera-icon">📸</span>
                <p>Tap to snap or upload</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="feedback-section animate-scale-in">
          <div className="mock-image">
            <span className="food-emoji">🍲</span>
          </div>
          
          <div className="alert-card danger">
            <div className="alert-header">
              <span className="alert-icon">⚠️</span>
              <h3>Bloating Incoming 💀</h3>
            </div>
            <p className="alert-body">
              Mixing heavy dairy (paneer) with citrus right now is going to wreck your digestion. 
            </p>
            <div className="alert-action">
              <strong>Quick Fix:</strong> Swap the paneer for tofu or remove the lemon entirely.
            </div>
          </div>
          
          <button className="btn-secondary full-width" onClick={() => setUploaded(false)}>
            Upload Another Meal
          </button>
        </div>
      )}
    </div>
  );
};

export default MealCheck;
