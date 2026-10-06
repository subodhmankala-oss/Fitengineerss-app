import React, { useEffect } from 'react';
import { getProgramTags, formatSets } from '../utils/programCardTags';

const LEVEL_LABEL = { beginner: '🌱 Beginner', intermediate: '⚡ Intermediate', advanced: '🔥 Advanced' };

// Bottom sheet shown when a Workout Library card is tapped: the program's
// tags and full exercise list, so a client sees what they're signing up for
// before the workout (and its clock) starts.
export default function LibraryProgramPreview({ workout, level, onStart, onClose }) {
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
  const { minutes, equipment } = getProgramTags(exercises, workout?.name);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="wt-preview-backdrop" onClick={onClose}>
      <div
        className="wt-preview-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wt-preview-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="wt-preview-head">
          <h3 id="wt-preview-title" className="wt-preview-title">{workout.name}</h3>
          <button type="button" className="wt-preview-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>

        <div className="wt-program-tags">
          <span className={`wt-program-tag wt-program-tag--${level}`}>{LEVEL_LABEL[level] || level}</span>
          <span className="wt-program-tag">⏱ ~{minutes} min</span>
          {equipment.map(e => <span key={e} className="wt-program-tag">{e}</span>)}
        </div>

        <ol className="wt-preview-list">
          {exercises.map((ex, i) => (
            <li key={`${ex.name}-${i}`} className="wt-preview-item">
              <span className="wt-preview-num">{i + 1}</span>
              <span className="wt-preview-name">{ex.name}</span>
              <span className="wt-preview-sets">{formatSets(ex.sets)}</span>
            </li>
          ))}
        </ol>

        <button type="button" className="wt-preview-start" onClick={() => onStart(workout, level)}>
          Start workout
        </button>
      </div>
    </div>
  );
}
