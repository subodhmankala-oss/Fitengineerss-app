import React, { useMemo } from 'react';
import { getMuscleGaps } from '../utils/muscleRegions';
import './exerciseRecChips.css';

/**
 * Log Sets nudge above "Add Exercise": the muscles/parts that are behind this
 * week, with one-tap chips that add a fitting exercise to the workout and a
 * link to the full muscle map. Counts the session in progress too, so it
 * updates as sets are ticked off.
 */
const MuscleGapHint = ({ logs, addedNames = [], onAdd, onOpenMuscleMap, limit = 3 }) => {
  const gaps = useMemo(() => getMuscleGaps(logs).slice(0, limit), [logs, limit]);
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
        <span className="muscle-gap-title">💡 Behind this week</span>
        {onOpenMuscleMap && <button type="button" className="muscle-gap-link" onClick={onOpenMuscleMap}>See muscle map →</button>}
      </div>
      <p className="muscle-gap-names">
        {gaps.map((g, i) => (
          <React.Fragment key={g.label}>
            {i > 0 && <span className="muscle-gap-dot"> · </span>}
            <strong>{g.label}</strong> <span className="muscle-gap-count">{g.sets}/{g.min}</span>
          </React.Fragment>
        ))}
      </p>
      <div className="muscle-gap-chips">
        {gaps.map(g => {
          const isAdded = added.has(g.suggestion.toLowerCase());
          return (
            <button
              key={g.label}
              type="button"
              className={`ex-history-rec-chip ex-history-rec-chip--tap ${isAdded ? 'ex-history-rec-chip--added' : ''}`}
              disabled={isAdded}
              onClick={() => onAdd(g.suggestion)}
            >
              {isAdded ? '✓' : '+'} {g.suggestion}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MuscleGapHint;
