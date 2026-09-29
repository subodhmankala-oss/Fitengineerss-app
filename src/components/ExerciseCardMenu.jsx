import React, { useState } from 'react';
import { TrashIcon, DragHandleIcon } from './TimerIcons';

// Per-exercise 3-dot menu shared by the client logger and the coach editor /
// Live Log. It holds the two actions that used to sit beside the exercise
// name: the press-and-drag reorder handle and Remove. Styles live in
// WorkoutTracker.css.
export default function ExerciseCardMenu({ name, onReorderPointerDown, onMoveUp, onMoveDown, onRemove }) {
  const [open, setOpen] = useState(false);
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
            {/* Same press-and-drag behaviour as the old inline handle: the
                drag starts on pointerdown and follows the finger, so the
                menu closes as soon as it begins. */}
            <button
              type="button"
              role="menuitem"
              className="btn-drag-handle ex-card-menu-drag"
              onPointerDown={(e) => { onReorderPointerDown(e); setOpen(false); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') { e.preventDefault(); onMoveUp(); }
                if (e.key === 'ArrowDown') { e.preventDefault(); onMoveDown(); }
              }}
              title="Hold and drag to reorder"
              style={{ touchAction: 'none' }}
            >
              <DragHandleIcon size={16} /> Drag to reorder
            </button>
            <button
              type="button"
              role="menuitem"
              className="ex-card-menu-danger"
              onClick={() => { setOpen(false); onRemove(); }}
            >
              <TrashIcon size={16} /> Remove exercise
            </button>
          </div>
        </>
      )}
    </div>
  );
}
