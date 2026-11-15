import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TrashLine = ({ size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);

// The "Set removed · Undo" toast for useSetLiftDrop, fixed to the bottom of
// the screen (portalled so a transformed ancestor can't trap it).
export default function SetLiftOverlay({ undo, onUndo }) {
  if (!undo) return null;
  return createPortal(
    <div key={undo.id} className="set-lift-undo" role="status">
      <span>Set removed</span>
      <button type="button" onClick={onUndo}>Undo</button>
      <span className="set-lift-undo-bar" />
    </div>,
    document.body
  );
}

// Wraps an exercise card's Add Set / Start Rest bar. While a set of THIS
// exercise is lifted the bar gives way to the "Drop to remove" zone, so the
// bin is always just under the sets being dragged.
export function SetDropZone({ exIdx, liftDrop, children }) {
  const { bin, binRef } = liftDrop;
  const active = bin?.exIdx === exIdx;
  const cls = [
    'set-drop-zone',
    active && bin.hot && bin.allowed ? 'is-hot' : '',
    active && !bin.allowed ? 'is-blocked' : '',
  ].join(' ');
  return (
    <div className={`set-drop-zone-wrap ${active ? 'is-lifting' : ''}`}>
      {children}
      <div ref={active ? binRef : undefined} className={cls} aria-hidden={!active}>
        <TrashLine />
        {active && !bin.allowed ? 'Keep at least one set' : 'Drop to remove'}
      </div>
    </div>
  );
}

// "Hold a set to move or remove it" under the first exercise. Shown on the
// first HINT_SHOWS opens of the logger on this device (for everyone), and
// hidden for the rest of that open once a set is lifted or ✕ is tapped.
const HINT_SHOWS = 5;
export function SetLiftHint({ storageKey, hide }) {
  const [show, setShow] = useState(() => {
    try { return Number(localStorage.getItem(storageKey) || 0) < HINT_SHOWS; } catch { return false; }
  });
  // Counted once per open of the logger.
  const counted = useRef(false);
  useEffect(() => {
    if (!show || counted.current) return;
    counted.current = true;
    try { localStorage.setItem(storageKey, String(Number(localStorage.getItem(storageKey) || 0) + 1)); } catch { /* storage blocked */ }
  }, [show, storageKey]);
  if (!show || hide) return null;
  return (
    <div className="set-lift-hint" role="note">
      <span className="set-lift-hint-dot" aria-hidden="true" />
      Hold a set to move or remove it
      <button type="button" aria-label="Dismiss tip" onClick={() => setShow(false)}>✕</button>
    </div>
  );
}
