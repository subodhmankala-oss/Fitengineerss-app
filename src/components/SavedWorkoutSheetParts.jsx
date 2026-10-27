import React from 'react';
import { isBodyweightExercise } from '../data/exerciseLibrary';
import { maskDigitsToTimeString } from '../utils/liveWorkoutTimer';
import { missedSetKind, MISSED_SET_COLUMNS } from '../utils/missedExercises';

// Pieces shared by the two sheets that change a saved workout
// (AddMissedExercisesModal, EditSavedWorkoutModal). Exercise cards and set
// rows reuse the logger's own classes (form-exercise-card/hevy-exercise-card,
// hevy-sets-table, hevy-set-row, set-input-field from WorkoutTracker.css), so
// they look exactly like logging a workout.

export const CloseIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const PlusIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const PencilLineIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" />
  </svg>
);

// Same labels as the logger: working sets numbered 1, 2, 3…; W / F / D / S
// for warm-up, failure, drop and superset sets.
function setLabels(setTypes) {
  let working = 0;
  return setTypes.map(t => {
    if (t === 'warmup') return { label: 'W', cls: 'warmup' };
    if (t === 'failure') return { label: 'F', cls: 'failure' };
    if (t === 'drop') return { label: 'D', cls: 'drop' };
    if (t === 'superset') return { label: 'S', cls: 'superset' };
    working += 1;
    return { label: String(working), cls: '' };
  });
}

// The logger's SET | PREV | KG | REPS | ✕ table. `prev` is the text for the
// PREV column per set (the saved value when editing; empty when adding),
// `changed(setIdx)` marks a row that differs from what's saved,
// `setTypes` gives each set's type for its label, and `hints` (form values
// per set, e.g. last time's) show as the empty boxes' placeholders.
export function SetGrid({ name, sets, setTypes = [], prev = [], prevTitle = 'PREV', hints = [], changed = () => false, onChange, onRemove, canRemove = () => true }) {
  const kind = missedSetKind(name);
  const cols = MISSED_SET_COLUMNS[kind];
  const bw = isBodyweightExercise(name);
  const cardio = kind === 'cardio' ? ' hevy-set-row--cardio' : '';
  const labels = setLabels(sets.map((_, i) => setTypes[i] || null));
  // Which box sits under the KG and REPS headers — same placement as the
  // logger: a timed hold's TIME under KG, a warm-up's REPS under REPS.
  const slots = cols.length === 2 ? cols : kind === 'repsOnly' ? [null, cols[0]] : [cols[0], null];
  const headerFor = (col) => (!col ? '' : col[0] === 'weight' && bw ? 'BW / KG' : col[1]);
  return (
    <div className="hevy-sets-table">
      <div className={`hevy-table-header${cardio}`}>
        <span className="col-set">SET</span>
        <span className="col-prev">{prevTitle}</span>
        <span className="col-weight">{headerFor(slots[0])}</span>
        <span className="col-reps">{headerFor(slots[1])}</span>
        <span className="col-check" />
      </div>
      <div className="hevy-table-body">
        {sets.map((set, setIdx) => {
          return (
            <div key={setIdx} className={`hevy-set-row${cardio}${changed(setIdx) ? ' saved-sheet-row-changed' : ''}`}>
              <span className="col-set">
                <span className={`set-num-lbl ${labels[setIdx].cls}`}>{labels[setIdx].label}</span>
              </span>
              <span className="col-prev set-prev-lbl">{prev[setIdx] || '–'}</span>
              {slots.map((col, i) => col ? (
                <span key={col[0]} className="set-input-field">
                  <input
                    aria-label={`${name} set ${setIdx + 1} ${col[1].toLowerCase()}`}
                    inputMode={col[2] === 'time' ? 'numeric' : col[2]}
                    placeholder={hints[setIdx]?.[col[0]] || (col[2] === 'time' ? 'mm:ss' : col[0] === 'weight' && bw ? 'BW' : '0')}
                    value={set[col[0]]}
                    onFocus={e => {
                      // Like confirming the logger's PREV ghost: an empty box
                      // takes its hint on tap, selected so typing replaces it.
                      const hint = hints[setIdx]?.[col[0]];
                      if (!set[col[0]] && hint) {
                        onChange(setIdx, col[0], hint);
                        const input = e.target;
                        requestAnimationFrame(() => input.select());
                      }
                    }}
                    onChange={e => onChange(setIdx, col[0], col[2] === 'time' ? maskDigitsToTimeString(e.target.value) : e.target.value.replace(col[2] === 'decimal' ? /[^0-9.]/g : /\D/g, ''))}
                  />
                </span>
              ) : <span key={`empty-${i}`} />)}
              <span className="set-actions-field">
                <button type="button" className="saved-sheet-remove-set" onClick={() => onRemove(setIdx)} aria-label={`Remove ${name} set ${setIdx + 1}`} disabled={!canRemove(setIdx)}><CloseIcon size={16} /></button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Plain sheet top: title, one muted line under it, close.
export function SheetHeader({ title, titleId, subtitle, onClose, disabled }) {
  return (
    <div className="missed-ex-header">
      <div className="saved-sheet-titles">
        <h3 id={titleId}>{title}</h3>
        <div className="missed-ex-sub">{subtitle}</div>
      </div>
      <button type="button" className="missed-ex-icon-btn" onClick={onClose} aria-label="Close" disabled={disabled}><CloseIcon /></button>
    </div>
  );
}
