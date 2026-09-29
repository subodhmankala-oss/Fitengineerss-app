import React, { useState } from 'react';
import { TrashIcon, DragHandleIcon } from './TimerIcons';

// Per-exercise 3-dot menu shared by the client logger and the coach editor /
// Live Log: Move up, Move down, Remove. Styles live in WorkoutTracker.css.
export default function ExerciseCardMenu({ name, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onRemove }) {
  const [open, setOpen] = useState(false);
  const run = (fn) => () => { setOpen(false); fn(); };
  return (
    <div className="ex-card-menu-wrap">
      <button
        type="button"
        className="btn-ex-card-menu"
        onClick={() => setOpen(o => !o)}
        aria-label={`More options for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <line x1="5" y1="9" x2="19" y2="9" /><line x1="5" y1="15" x2="19" y2="15" />
        </svg>
      </button>
      {open && (
        <>
          <div className="ex-card-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="ex-card-menu" role="menu">
            <button type="button" role="menuitem" disabled={!canMoveUp} onClick={run(onMoveUp)}>
              <DragHandleIcon size={16} /> Move up
            </button>
            <button type="button" role="menuitem" disabled={!canMoveDown} onClick={run(onMoveDown)}>
              <DragHandleIcon size={16} /> Move down
            </button>
            <button type="button" role="menuitem" className="ex-card-menu-danger" onClick={run(onRemove)}>
              <TrashIcon size={16} /> Remove exercise
            </button>
          </div>
        </>
      )}
    </div>
  );
}
