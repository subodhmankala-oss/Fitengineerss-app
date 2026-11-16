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

const LIST_PREVIEW = 3;

/**
 * Coach Live tab layout ("list"): "Still to train this week" — the muscles
 * furthest behind as rows with a sets-vs-target bar. Tapping a row opens its
 * suggested exercise (tap to add it to the live log); "See all" shows every
 * muscle that's behind.
 */
const MuscleGapList = ({ gaps, added, onAdd, onOpenMuscleMap }) => {
  const [openLabel, setOpenLabel] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(
    () => [...gaps].sort((a, b) => (a.sets / (a.min || 1)) - (b.sets / (b.min || 1))),
    [gaps]
  );

  if (!gaps.length) {
    return (
      <div className="muscle-gap-list muscle-gap-list--good">
        <span className="muscle-gap-list-title">Every muscle is on track this week</span>
        {onOpenMuscleMap && <button type="button" className="muscle-gap-list-link" onClick={onOpenMuscleMap}>Muscle map</button>}
      </div>
    );
  }

  const shown = showAll ? sorted : sorted.slice(0, LIST_PREVIEW);
  return (
    <div className="muscle-gap-list">
      <div className="muscle-gap-list-head">
        <span className="muscle-gap-list-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" fill="currentColor" />
          </svg>
          Still to train this week
        </span>
        {sorted.length > LIST_PREVIEW && (
          <button type="button" className="muscle-gap-list-link" onClick={() => setShowAll(s => !s)}>
            {showAll ? 'Show less' : `See all ${sorted.length}`}
          </button>
        )}
      </div>
      <div className="muscle-gap-list-rows">
        {shown.map(g => {
          const isOpen = openLabel === g.label;
          const isAdded = added.has(g.suggestion.toLowerCase());
          const pct = Math.max(4, Math.min(100, Math.round((g.sets / (g.min || 1)) * 100)));
          return (
            <div key={g.label} className={`muscle-gap-row${isOpen ? ' is-open' : ''}`}>
              <button
                type="button"
                className="muscle-gap-row-main"
                aria-expanded={isOpen}
                onClick={() => setOpenLabel(isOpen ? null : g.label)}
              >
                <span className="muscle-gap-row-top">
                  <span className="muscle-gap-row-label">{g.label}</span>
                  <span className="muscle-gap-row-count">{g.sets} / {g.min} sets</span>
                </span>
                <span className="muscle-gap-row-bar"><span style={{ width: `${pct}%` }} /></span>
              </button>
              {isOpen && (
                <div className="muscle-gap-row-add">
                  <button
                    type="button"
                    className={`ex-history-rec-chip ex-history-rec-chip--tap ${isAdded ? 'ex-history-rec-chip--added' : ''}`}
                    disabled={isAdded}
                    onClick={() => onAdd(g.suggestion)}
                  >
                    {isAdded ? '✓' : '+'} {g.suggestion}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showAll && onOpenMuscleMap && (
        <button type="button" className="muscle-gap-list-link muscle-gap-list-map" onClick={onOpenMuscleMap}>Open muscle map</button>
      )}
    </div>
  );
};

const MuscleGapHint = ({ logs, level = null, addedNames = [], onAdd, onOpenMuscleMap, variant = 'cards' }) => {
  const gaps = useMemo(() => getMuscleGaps(logs, undefined, level), [logs, level]);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => {
    setCollapsed(c => {
      try { localStorage.setItem(collapsedKey(), c ? '0' : '1'); } catch { /* ignore */ }
      return !c;
    });
  };
  const added = new Set(addedNames.map(n => n.toLowerCase()));

  if (variant === 'list') {
    return <MuscleGapList gaps={gaps} added={added} onAdd={onAdd} onOpenMuscleMap={onOpenMuscleMap} />;
  }

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
          {onOpenMuscleMap && <button type="button" className="muscle-gap-link" onClick={onOpenMuscleMap} tabIndex={collapsed ? -1 : 0}>Muscle map →</button>}
        </span>
        {/* Arrow in a circle: a bare tiny ▾ didn't read as "this folds". */}
        <button type="button" className="muscle-gap-fold" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Show suggestions' : 'Hide suggestions'}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className={collapsed ? '' : 'open'}>
            <path d="M3 5.25 7 9.25 11 5.25" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {/* Stays mounted so it can animate: the body's height eases between 0
          and its natural size (grid 0fr -> 1fr), cards fade with it. */}
      <div className="muscle-gap-body" aria-hidden={collapsed}>
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
      </div>
    </div>
  );
};

export default MuscleGapHint;
