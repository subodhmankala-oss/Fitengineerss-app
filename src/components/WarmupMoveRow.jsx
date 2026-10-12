import React from 'react';
import { isCardioExercise, isTimedExercise } from '../data/exerciseLibrary';

// One warm-up move as a compact row, in place of a full exercise card, in
// the client logger and the coach Live Log. Consecutive warm-up moves stack
// flush, so the warm-up block reads as a single "🔥 Warm-up" card: the first
// row carries the header, the last one closes the card. Each move is still
// its own exercise in the session data (saving, calories, drafts, drag
// reorder are unchanged) — only the rendering is grouped.
//
// Rep moves get a reps box; cardio and timed moves show their target time
// (ticking logs it, same as ticking a full card without running the timer).
export default function WarmupMoveRow({ ex, isFirst, isLast, onOpenHistory, onRepsChange, onTick, menu }) {
  const timeBased = isCardioExercise(ex.name) || isTimedExercise(ex.name);
  const done = ex.sets.length > 0 && ex.sets.every(s => s.isCompleted);
  return (
    <div className={`warmup-move-card${isFirst ? ' warmup-move-card--first' : ''}${isLast ? ' warmup-move-card--last' : ''}`}>
      {isFirst && (
        <div className="warmup-move-head">
          🔥 Warm-up <span>· go light, about 5 min</span>
        </div>
      )}
      <div className={`warmup-move-line${done ? ' warmup-move-line--done' : ''}`}>
        <span
          className="warmup-move-name ex-name-clickable"
          role="button"
          tabIndex={0}
          title="View exercise history"
          onClick={onOpenHistory}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenHistory(); } }}
          // Same tap-to-focus scroll guard as the full card's name.
          onPointerDown={(e) => e.preventDefault()}
        >
          {ex.name}
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
    </div>
  );
}
