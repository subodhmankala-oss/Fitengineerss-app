import React, { useState, useEffect } from 'react';
import { getYouTubeEmbedUrl } from '../utils/videoUtils';

// Hevy-style "how to perform this exercise" bottom sheet — video (where one
// exists), primary/secondary muscle summary, and a 3-step setup/execution/
// tip breakdown. Shared by the client (WorkoutTracker's own "🎬 Form Guide"
// button on a logged exercise) and the exercise picker's clickable
// thumbnail icon on both coach and client sides, so every "how do I do
// this" entry point in the app opens the exact same sheet. `exercise` is
// the shape normalizeExerciseForGuide() produces; pass null to keep it
// unmounted (no exercise selected).
export default function ExerciseGuideModal({ exercise, onClose }) {
  const [guideTab, setGuideTab] = useState('summary');

  useEffect(() => {
    setGuideTab('summary');
  }, [exercise]);

  if (!exercise) return null;

  return (
    <div className="guide-sheet-backdrop" onClick={onClose}>
      <div className="guide-sheet animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="guide-sheet-handle" />

        <div className="guide-image-section">
          {exercise.videoFile ? (
            getYouTubeEmbedUrl(exercise.videoFile) ? (
              <iframe
                key={exercise.videoFile}
                src={getYouTubeEmbedUrl(exercise.videoFile)}
                title="Exercise Form Guide"
                frameBorder="0"
                allowFullScreen
                style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#000' }}
              />
            ) : (
              <video
                key={exercise.videoFile}
                src={exercise.videoFile}
                autoPlay
                muted
                loop
                playsInline
                controls
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            )
          ) : (
            <div className="guide-image-placeholder">
              <span className="guide-image-icon">🏋️</span>
            </div>
          )}
          <button type="button" className="guide-sheet-close" onClick={onClose}>✕</button>
        </div>

        <div className="guide-tab-bar">
          {['summary', 'howto'].map(tab => (
            <button
              key={tab}
              type="button"
              className={`guide-tab-btn ${guideTab === tab ? 'guide-tab-btn--active' : ''}`}
              onClick={() => setGuideTab(tab)}
            >
              {tab === 'summary' ? 'Summary' : 'How to'}
            </button>
          ))}
        </div>

        <div className="guide-tab-content">
          {guideTab === 'summary' && (
            <div className="guide-summary">
              <h2 className="guide-ex-name">{exercise.name}</h2>
              <div className="guide-muscle-row">
                <span className="guide-muscle-label">Primary:</span>
                <span className="guide-muscle-value">{exercise.primary || exercise.category}</span>
              </div>
              {exercise.secondary && (
                <div className="guide-muscle-row">
                  <span className="guide-muscle-label">Secondary:</span>
                  <span className="guide-muscle-value guide-muscle-secondary">{exercise.secondary}</span>
                </div>
              )}
              <div className="guide-log-tip">
                <span className="guide-log-tip-icon">💡</span>
                <span>Focus on mind-muscle connection — feel the primary muscle work each rep.</span>
              </div>
            </div>
          )}
          {guideTab === 'howto' && (
            <div className="guide-howto">
              <div className="guide-howto-step">
                <span className="guide-step-num">1</span>
                <div>
                  <div className="guide-step-label">Setup</div>
                  <div className="guide-step-text">{exercise.guide?.setup}</div>
                </div>
              </div>
              <div className="guide-howto-step">
                <span className="guide-step-num">2</span>
                <div>
                  <div className="guide-step-label">Execution</div>
                  <div className="guide-step-text">{exercise.guide?.execution}</div>
                </div>
              </div>
              <div className="guide-howto-step">
                <span className="guide-step-num">3</span>
                <div>
                  <div className="guide-step-label">Coach's Tip</div>
                  <div className="guide-step-text">{exercise.guide?.tip}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
