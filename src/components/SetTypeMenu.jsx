import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { SET_TYPE_OPTIONS } from '../utils/setTypes';

const REMOVE_OPTION = { type: 'remove', badge: '✕', label: 'Remove Set', desc: 'Delete this set', color: '#ef4444' };

// A polished dropdown that renders above the anchoring set number.
// `onSelect(type, anchor)` receives one of: warmup | normal | failure | drop | remove,
// plus an in-row element (the portal isn't a DOM child of the row) so callers
// can find the row, e.g. to animate its removal.
export default function SetTypeMenu({ onSelect }) {
  const anchorRef = useRef(null);
  const renderOption = (opt) => (
    <button
      key={opt.type}
      type="button"
      className={`set-type-option ${opt.type === 'remove' ? 'is-remove' : ''}`}
      onClick={(e) => { e.stopPropagation(); onSelect(opt.type, anchorRef.current); }}
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
  return (
    <>
      <span ref={anchorRef} style={{ display: 'none' }} />
      {createPortal(
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
      )}
    </>
  );
}
