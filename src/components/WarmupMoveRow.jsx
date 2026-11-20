import React from 'react';
import { isCardioExercise, isTimedExercise } from '../data/exerciseLibrary';

// One warm-up move as a compact row, in place of a full exercise card, in
// the client logger and the coach Live Log. Consecutive warm-up moves stack
// flush, so the warm-up block reads as a single "🔥 Warm-up" card: the first
// row carries the header, the last one closes the card. Each move is still
// its own exercise in the session data (saving, calories, drafts, drag
// reorder are unchanged) — only the rendering is grouped.
//
// Tapping the name (or 🎬) opens the Form Guide video — how to do the move
// is what matters for a warm-up; its logged history is always empty, since
// warm-up sets stay out of PREV and history.
//
// Rep moves get a reps box; cardio and timed moves show their target time
// (ticking logs it, same as ticking a full card without running the timer).
//
// `why` (a coach plan's daily warm-up, see utils/dailyWarmup) is one line
// under the last row saying why these moves fit today.
export default function WarmupMoveRow({ ex, isFirst, isLast, why, onShowFormGuide, onRepsChange, onTick, menu }) {
  const timeBased = isCardioExercise(ex.name) || isTimedExercise(ex.name);
  const done = ex.sets.length > 0 && ex.sets.every(s => s.isCompleted);
  return (
    <div className={`warmup-move-card${isFirst ? ' warmup-move-card--first' : ''}${isLast ? ' warmup-move-card--last' : ''}`}>
      {isFirst && (
        <div className="warmup-move-head">
          🔥 Warm-up <span>· go light, about 5 min</span>
        </div>
      )}
      <div className={`warmup-move-line${done ? ' warmup-move-line--done' : ''}${ex.sets.length > 1 ? ' warmup-move-line--multi' : ''}`}>
        <span className="warmup-move-title">
          <span
            className="warmup-move-name ex-name-clickable"
            role="button"
            tabIndex={0}
            title={`How to do ${ex.name}`}
            onClick={onShowFormGuide}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onShowFormGuide(); } }}
            // Same tap-to-focus scroll guard as the full card's name.
            onPointerDown={(e) => e.preventDefault()}
          >
            {ex.name}
          </span>
          <button
            type="button"
            className="warmup-move-guide"
            aria-label={`Form guide for ${ex.name}`}
            onClick={onShowFormGuide}
          >
            🎬
          </button>
        </span>
        <div className="warmup-move-sets">
          {ex.sets.map((set, sIdx) => (
            <span key={sIdx} className="warmup-move-set">
              {timeBased ? (
                <span className="warmup-move-time">{set.time || set.targetTime || '—'}</span>
              ) : (
                <>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="warmup-move-reps"
                    aria-label={`${ex.name} reps${ex.sets.length > 1 ? `, set ${sIdx + 1}` : ''}`}
                    value={set.reps ?? ''}
                    disabled={set.isCompleted}
                    onChange={(e) => onRepsChange(sIdx, e.target.value.replace(/\D/g, '').slice(0, 3))}
                  />
                  <span className="warmup-move-unit">reps</span>
                </>
              )}
              <button
                type="button"
                className={`btn-hevy-check ${set.isCompleted ? 'completed' : ''}`}
                onClick={() => onTick(sIdx)}
                aria-label={`${set.isCompleted ? 'Undo' : 'Complete'} ${ex.name}${ex.sets.length > 1 ? ` set ${sIdx + 1}` : ''}`}
              >
                {set.isCompleted ? '✓' : ''}
              </button>
            </span>
          ))}
        </div>
        {menu}
      </div>
      {isLast && why && (
        <p className="warmup-move-why">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" />
          </svg>
          <span>{why}</span>
        </p>
      )}
    </div>
  );
}
