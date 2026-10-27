import React from 'react';
import { isBodyweightExercise } from '../data/exerciseLibrary';
import { maskDigitsToTimeString } from '../utils/liveWorkoutTimer';
import { getMuscleGroupsForExercise } from '../utils/muscleGroups';
import { missedSetKind, MISSED_SET_COLUMNS } from '../utils/missedExercises';
import MuscleThumbnail from './MuscleAnalytics/MuscleThumbnail';

// Pieces shared by the two sheets that change a saved workout:
// AddMissedExercisesModal and EditSavedWorkoutModal.

export const PlusIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" />
  </svg>
);
export const PencilLineIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" />
  </svg>
);
export const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
export const CloseIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const ChevronIcon = ({ open }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const FlameIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z" />
  </svg>
);

// Same muscle icon the exercise picker shows; first letter when the exercise
// has no mapped muscle (cardio, warm-ups).
export function ExerciseAvatar({ name, color = '#60a5fa' }) {
  const muscle = getMuscleGroupsForExercise(name)[0];
  return (
    <div className="saved-sheet-avatar" style={{ '--avatar-color': color }} aria-hidden="true">
      {muscle ? <MuscleThumbnail muscle={muscle} color={color} size={36} /> : <span>{name.charAt(0).toUpperCase()}</span>}
    </div>
  );
}

const UNIT = { weight: 'kg', reps: 'reps', distanceKm: 'km' };

// One row per set: a round set badge, then the set's boxes with their unit
// inside. onChange(setIdx, field, value) gets the already-masked value;
// onRemove(setIdx); canRemove(setIdx) enables a set's remove button.
export function SetGrid({ name, sets, onChange, onRemove, canRemove = () => true }) {
  const cols = MISSED_SET_COLUMNS[missedSetKind(name)];
  const bw = isBodyweightExercise(name);
  return (
    <div className="saved-sheet-sets">
      {sets.map((set, setIdx) => (
        <div key={setIdx} className="saved-sheet-set" style={{ gridTemplateColumns: `30px repeat(${cols.length}, minmax(0, 1fr)) 30px` }}>
          <span className="saved-sheet-set-badge">{setIdx + 1}</span>
          {cols.map(([field, label, mode]) => (
            <label key={field} className={`saved-sheet-field${set[field] ? ' filled' : ''}`}>
              <input
                className="missed-ex-input"
                aria-label={`${name} set ${setIdx + 1} ${label.toLowerCase()}`}
                inputMode={mode === 'time' ? 'numeric' : mode}
                placeholder={mode === 'time' ? '00:00' : field === 'weight' && bw ? 'BW' : '0'}
                value={set[field]}
                onChange={e => onChange(setIdx, field, mode === 'time' ? maskDigitsToTimeString(e.target.value) : e.target.value.replace(mode === 'decimal' ? /[^0-9.]/g : /\D/g, ''))}
              />
              <span className="saved-sheet-unit">{mode === 'time' ? 'min' : UNIT[field]}</span>
            </label>
          ))}
          <button type="button" className="missed-ex-icon-btn small" onClick={() => onRemove(setIdx)} aria-label={`Remove ${name} set ${setIdx + 1}`} disabled={!canRemove(setIdx)}><CloseIcon size={16} /></button>
        </div>
      ))}
    </div>
  );
}

// Sheet top: grab handle, tinted icon tile, title/subtitle, close.
export function SheetHeader({ icon, tone, title, titleId, subtitle, onClose, disabled }) {
  return (
    <>
      <div className="saved-sheet-handle" aria-hidden="true" />
      <div className="missed-ex-header">
        <div className={`saved-sheet-icon ${tone}`} aria-hidden="true">{icon}</div>
        <div className="saved-sheet-titles">
          <h3 id={titleId}>{title}</h3>
          <div className="missed-ex-sub">{subtitle}</div>
        </div>
        <button type="button" className="missed-ex-icon-btn" onClick={onClose} aria-label="Close" disabled={disabled}><CloseIcon /></button>
      </div>
    </>
  );
}
