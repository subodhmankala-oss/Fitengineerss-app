import React, { useMemo } from 'react';
import { getMuscleGaps } from '../utils/muscleRegions';
import './exerciseRecChips.css';

/**
 * Log Sets nudge above "Add Exercise": every muscle/part that is behind this
 * week, as one swipeable row of small cards (part + sets vs target, and a
 * one-tap chip that adds a fitting exercise to the workout), plus a link to
 * the full muscle map. Counts the session in progress too, so it updates as
 * sets are ticked off.
 */
const MuscleGapHint = ({ logs, addedNames = [], onAdd, onOpenMuscleMap }) => {
  const gaps = useMemo(() => getMuscleGaps(logs), [logs]);
  const added = new Set(addedNames.map(n => n.toLowerCase()));

  if (!gaps.length) {
    return (
      <div className="muscle-gap-hint muscle-gap-hint--good">
        <span className="muscle-gap-title">✅ Every muscle is on track this week</span>
        {onOpenMuscleMap && <button type="button" className="muscle-gap-link" onClick={onOpenMuscleMap}>See muscle map →</button>}
      </div>
    );
  }

  return (
    <div className="muscle-gap-hint">
      <div className="muscle-gap-head">
        <span className="muscle-gap-title">💡 {gaps.length} behind this week</span>
        {onOpenMuscleMap && <button type="button" className="muscle-gap-link" onClick={onOpenMuscleMap}>See muscle map →</button>}
      </div>
      {gaps.length > 1 && <p className="muscle-gap-sub">Swipe to see them all — tap one to add it</p>}
      <div className="muscle-gap-cards">
        {gaps.map(g => {
          const isAdded = added.has(g.suggestion.toLowerCase());
          return (
            <div key={g.label} className="muscle-gap-card">
              <span className="muscle-gap-card-label">
                <strong>{g.label}</strong>
                <span className="muscle-gap-count">{g.sets}/{g.min} sets</span>
              </span>
              <button
                type="button"
                className={`ex-history-rec-chip ex-history-rec-chip--tap ${isAdded ? 'ex-history-rec-chip--added' : ''}`}
                disabled={isAdded}
                onClick={() => onAdd(g.suggestion)}
              >
                {isAdded ? '✓' : '+'} {g.suggestion}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MuscleGapHint;
