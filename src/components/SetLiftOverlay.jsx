import React from 'react';
import { createPortal } from 'react-dom';

// The "Drop to remove" pill and the "Set removed · Undo" toast for
// useSetLiftDrop. Portalled to <body> and fixed to the bottom of the
// screen so the bin is always reachable, however long the exercise card is.
export default function SetLiftOverlay({ bin, binRef, undo, onUndo }) {
  return createPortal(
    <>
      <div
        ref={binRef}
        className={`set-lift-bin ${bin ? 'is-on' : ''} ${bin?.hot && bin?.allowed ? 'is-hot' : ''} ${bin && !bin.allowed ? 'is-blocked' : ''}`}
        aria-hidden={!bin}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
        {bin && !bin.allowed ? 'Keep at least one set' : 'Drop to remove'}
      </div>
      {undo && (
        <div key={undo.id} className="set-lift-undo" role="status">
          <span>Set removed</span>
          <button type="button" onClick={onUndo}>Undo</button>
          <span className="set-lift-undo-bar" />
        </div>
      )}
    </>,
    document.body
  );
}
