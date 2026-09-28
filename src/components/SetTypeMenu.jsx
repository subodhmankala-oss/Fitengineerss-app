import React from 'react';
import { createPortal } from 'react-dom';
import { SET_TYPE_OPTIONS } from '../utils/setTypes';

const REMOVE_OPTION = { type: 'remove', badge: '✕', label: 'Remove Set', desc: 'Delete this set', color: '#ef4444' };

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
