import React from 'react';
import { createPortal } from 'react-dom';

// Single source of truth for the Hevy-style "Select Set Type" popup used across
// the coach Workout Plan editor, the coach Live Log, and the client Log Sets logger.
export const SET_TYPE_OPTIONS = [
  { type: 'warmup',  badge: 'W', label: 'Warm Up Set', desc: 'Light prep — not counted toward progress', color: '#f59e0b' },
  { type: 'normal',  badge: '1', label: 'Normal Set',  desc: 'Standard working set',                     color: '#10b981' },
  { type: 'failure', badge: 'F', label: 'Failure Set', desc: 'Pushed to muscular failure',               color: '#ef4444' },
  { type: 'drop',    badge: 'D', label: 'Drop Set',    desc: 'Drop the weight, keep repping',            color: '#8b5cf6' },
];

const REMOVE_OPTION = { type: 'remove', badge: '✕', label: 'Remove Set', desc: 'Delete this set', color: '#ef4444' };

// Resolve the badge letter + accent colour for a stored set, so the row label
// matches the menu. `workingNum` is the sequential number among normal sets.
export const getSetTypeVisual = (set, workingNum) => {
  if (set.setType === 'failure') return { label: 'F', color: '#ef4444' };
  if (set.setType === 'drop')    return { label: 'D', color: '#8b5cf6' };
  if (set.isWarmup)              return { label: 'W', color: '#f59e0b' };
  return { label: workingNum, color: null };
};

// A polished dropdown that renders above the anchoring set number.
// `onSelect(type)` receives one of: warmup | normal | failure | drop | remove.
export default function SetTypeMenu({ onSelect }) {
  const renderOption = (opt) => (
    <button
      key={opt.type}
      type="button"
      className={`set-type-option ${opt.type === 'remove' ? 'is-remove' : ''}`}
      onClick={(e) => { e.stopPropagation(); onSelect(opt.type); }}
    >
      <span
        className="set-type-badge"
        style={{ color: opt.color, borderColor: `${opt.color}55`, background: `${opt.color}22` }}
      >
        {opt.badge}
      </span>
      <span className="set-type-option-text">
        <span className="set-type-option-label">{opt.label}</span>
        <span className="set-type-option-desc">{opt.desc}</span>
      </span>
    </button>
  );

  // Portal to <body> so the fixed bottom sheet spans the true viewport edges —
  // otherwise a transformed ancestor (slide-up animation) becomes its containing
  // block and the sheet no longer reaches the screen edges.
  return createPortal(
    <>
      {/* Tapping the dimmed backdrop bubbles to document, closing the sheet. */}
      <div className="set-type-sheet-backdrop" />
      <div className="set-type-menu" onClick={(e) => e.stopPropagation()}>
        <div className="set-type-sheet-handle" />
        <div className="set-type-menu-header">Select Set Type</div>
        <div className="set-type-menu-list">
          {SET_TYPE_OPTIONS.map(renderOption)}
        </div>
        <div className="set-type-menu-divider" />
        {renderOption(REMOVE_OPTION)}
      </div>
    </>,
    document.body
  );
}
