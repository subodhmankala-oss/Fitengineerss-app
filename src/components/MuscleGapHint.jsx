import React, { useMemo, useState } from 'react';
import { getMuscleGaps } from '../utils/muscleRegions';
import './exerciseRecChips.css';

/**
 * Log Sets nudge above "Add Exercise": every muscle/part that is behind this
 * week, as one swipeable row of small cards (part + sets vs target, and a
 * one-tap chip that adds a fitting exercise to the workout), plus a link to
 * the full muscle map. Counts the session in progress too, so it updates as
 * sets are ticked off.
 */
// Folded/unfolded is a per-user, per-phone preference: a client who folds it
// keeps it folded in every workout until they open it again.
const collapsedKey = () => `muscleGapHintCollapsed_${localStorage.getItem('userId') || 'anon'}`;
const readCollapsed = () => {
  try { return localStorage.getItem(collapsedKey()) === '1'; } catch { return false; }
};

const MuscleGapHint = ({ logs, addedNames = [], onAdd, onOpenMuscleMap }) => {
  const gaps = useMemo(() => getMuscleGaps(logs), [logs]);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => {
    setCollapsed(c => {
      try { localStorage.setItem(collapsedKey(), c ? '0' : '1'); } catch { /* ignore */ }
      return !c;
    });
  };
  const added = new Set(addedNames.map(n => n.toLowerCase()));

  if (!gaps.length) {
    return (
      <div className="muscle-gap-hint muscle-gap-hint--good">
        <div className="muscle-gap-head">
          <span className="muscle-gap-title">✅ Every muscle is on track this week</span>
          {onOpenMuscleMap && <button type="button" className="muscle-gap-link" onClick={onOpenMuscleMap}>Muscle map →</button>}
        </div>
      </div>
    );
  }

  return (
    <div className={`muscle-gap-hint${collapsed ? ' muscle-gap-hint--collapsed' : ''}`}>
      <div className="muscle-gap-head">
        <span className="muscle-gap-lead">
          <button type="button" className="muscle-gap-toggle" onClick={toggle} aria-expanded={!collapsed}>
            <span className="muscle-gap-title">💡 <strong>{gaps.length}</strong> behind this week</span>
          </button>
          {!collapsed && onOpenMuscleMap && <button type="button" className="muscle-gap-link" onClick={onOpenMuscleMap}>Muscle map →</button>}
        </span>
        {/* Arrow in a circle: a bare tiny ▾ didn't read as "this folds". */}
        <button type="button" className="muscle-gap-fold" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Show suggestions' : 'Hide suggestions'}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className={collapsed ? '' : 'open'}>
            <path d="M3 5.25 7 9.25 11 5.25" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {!collapsed && (<>
      <div className="muscle-gap-cards">
        {gaps.map(g => {
          const isAdded = added.has(g.suggestion.toLowerCase());
          return (
            <div key={g.label} className="muscle-gap-card">
              <span className="muscle-gap-card-label">
                {g.label} · <span className="muscle-gap-count">{g.sets}/{g.min}</span>
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
      </>)}
    </div>
  );
};

export default MuscleGapHint;
