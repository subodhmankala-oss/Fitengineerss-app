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
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
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
