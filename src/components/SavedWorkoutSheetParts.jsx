import React from 'react';
import { isBodyweightExercise } from '../data/exerciseLibrary';
import { maskDigitsToTimeString } from '../utils/liveWorkoutTimer';
import { missedSetKind, MISSED_SET_COLUMNS } from '../utils/missedExercises';

// Pieces shared by the two sheets that change a saved workout:
// AddMissedExercisesModal and EditSavedWorkoutModal.

export const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" />
  </svg>
);
export const PencilLineIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" />
  </svg>
);
export const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
export const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

// Header row + one input row per set. `sets` are form values; onChange(setIdx,
// field, value) gets the already-masked value; onRemove(setIdx).
// canRemove(setIdx) decides whether a set's remove button is enabled.
export function SetGrid({ name, sets, onChange, onRemove, canRemove = () => true }) {
  const cols = MISSED_SET_COLUMNS[missedSetKind(name)];
  const template = { gridTemplateColumns: `28px repeat(${cols.length}, 1fr) 28px` };
  return (
    <>
      <div className="missed-ex-grid missed-ex-grid-head" style={template}>
        <span>SET</span>{cols.map(([f, label]) => <span key={f}>{label}</span>)}<span />
      </div>
      {sets.map((set, setIdx) => (
        <div key={setIdx} className="missed-ex-grid" style={template}>
          <span className="missed-ex-setnum">{setIdx + 1}</span>
          {cols.map(([field, label, mode]) => (
            <input
              key={field}
              className="missed-ex-input"
              aria-label={`${name} set ${setIdx + 1} ${label.toLowerCase()}`}
              inputMode={mode === 'time' ? 'numeric' : mode}
              placeholder={mode === 'time' ? '00:00' : field === 'weight' ? (isBodyweightExercise(name) ? 'BW' : 'kg') : '–'}
              value={set[field]}
              onChange={e => onChange(setIdx, field, mode === 'time' ? maskDigitsToTimeString(e.target.value) : e.target.value.replace(mode === 'decimal' ? /[^0-9.]/g : /\D/g, ''))}
            />
          ))}
          <button type="button" className="missed-ex-icon-btn small" onClick={() => onRemove(setIdx)} aria-label={`Remove ${name} set ${setIdx + 1}`} disabled={!canRemove(setIdx)}><CloseIcon /></button>
        </div>
      ))}
    </>
  );
}
