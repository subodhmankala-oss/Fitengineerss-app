import React, { useMemo, useState } from 'react';
import { swapAlternatives } from '../utils/aiWorkoutCatalog';

// Plan editor "Swap": a short list of library exercises for the same muscle
// (then the same body area) to put in place of one exercise — one tap
// instead of remove, open the picker, search, add and drag back into place.
// Used for AI drafts and hand-built plans alike. "Search all exercises"
// falls back to the full picker for anything not suggested.
const SwapExerciseSheet = ({ exercise, dayExerciseNames, catalog, onPick, onSearchAll, onClose }) => {
  const [showMore, setShowMore] = useState(false);
  const alternatives = useMemo(
    () => (catalog ? swapAlternatives(exercise.name, catalog, { exclude: dayExerciseNames, limit: 20 }) : []),
    [catalog, exercise.name, dayExerciseNames]
  );
  const shown = showMore ? alternatives : alternatives.slice(0, 8);

  return (
    <div className="payment-gateway-backdrop" onClick={onClose}>
      <div
        className="payment-gateway-modal animate-scale-in"
        style={{ maxWidth: '380px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="payment-modal-header">
          <div className="modal-title-box">
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Swap</span>
            <h3 style={{ fontSize: '1rem' }}>{exercise.name}</h3>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '4px 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {!catalog ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 2px' }}>Loading your exercise library…</p>
          ) : alternatives.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 2px' }}>No similar exercises found in your library.</p>
          ) : (
            shown.map(alt => (
              <button
                key={alt.name}
                type="button"
                onClick={() => onPick(alt)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                  padding: '10px 12px', borderRadius: 'var(--radius-sm)', textAlign: 'left',
                  border: '1px solid var(--border-color)', background: 'rgba(var(--fg-rgb), 0.03)',
                  color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600
                }}
              >
                <span>{alt.name}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{alt.muscle}</span>
              </button>
            ))
          )}
          {!showMore && alternatives.length > 8 && (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              style={{ background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', padding: '6px 0' }}
            >
              Show {alternatives.length - 8} more
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onSearchAll}
          style={{
            marginTop: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
            border: '1px dashed rgba(var(--accent-rgb), 0.35)', background: 'rgba(var(--accent-rgb), 0.06)',
            color: 'var(--accent-text)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer'
          }}
        >
          Search all exercises instead
        </button>
      </div>
    </div>
  );
};

export default SwapExerciseSheet;
