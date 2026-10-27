import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import ExercisePickerModal from './ExercisePickerModal';
import { isBodyweightExercise } from '../data/exerciseLibrary';
import { BinIcon } from './TimerIcons';
import { maskDigitsToTimeString, estimateMissedSetsKcal, estimateCardioDistanceKm, parseTimeStringToSeconds, DEFAULT_BODY_WEIGHT_KG } from '../utils/liveWorkoutTimer';
import { missedSetKind, emptyMissedSet, toSavedMissedExercises } from '../utils/missedExercises';
import './WorkoutTracker.css';
import './AddMissedExercisesModal.css';

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" />
  </svg>
);
const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const COLUMNS = {
  reps: [['weight', 'KG', 'decimal'], ['reps', 'REPS', 'numeric']],
  repsOnly: [['reps', 'REPS', 'numeric']],
  cardio: [['distanceKm', 'KM', 'decimal'], ['time', 'TIME', 'time']],
  timed: [['time', 'TIME', 'time']],
  timedWeighted: [['weight', 'KG', 'decimal'], ['time', 'TIME', 'time']]
};

// "Add missed exercise" sheet, shared by the client (Home → Daily) and the
// coach (client History card). The exercises already saved that day stay
// locked; only new ones are entered here, then handed to onSave(exercises,
// addedCalories), which does the append (databaseService.appendMissedExercises).
// No default weights: the boxes start empty.
export default function AddMissedExercisesModal({
  open, onClose, onSave, dateLabel, planName, savedExerciseNames = [],
  bodyWeightKg = DEFAULT_BODY_WEIGHT_KG, creatorMode = 'client', coachId = null, clientUserId = null, clientName = ''
}) {
  const [exercises, setExercises] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSaved, setShowSaved] = useState(false);

  // Fresh form on every open.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setExercises([]); setError(''); setSaving(false); setShowSaved(false); setPickerOpen(true); }
  }

  if (!open) return null;

  const savedLower = new Set(savedExerciseNames.map(n => n.toLowerCase()));
  const addExercise = (name, exerciseId = null) => {
    if (exercises.some(ex => ex.name.toLowerCase() === name.toLowerCase())) return;
    setError('');
    setExercises(prev => [...prev, { name, ...(exerciseId ? { exerciseId } : {}), sets: [emptyMissedSet(name), emptyMissedSet(name), emptyMissedSet(name)] }]);
  };
  const removeExercise = (name) => setExercises(prev => prev.filter(ex => ex.name.toLowerCase() !== name.toLowerCase()));
  const updateSet = (exIdx, setIdx, field, value) => {
    setError('');
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex, sets: ex.sets.map((s, j) => j !== setIdx ? s : withCardioKm(ex.name, s, field, value))
    }));
  };
  // Same as the logger's handleCardioTimeEdit: typing a cardio time fills KM
  // from an average pace, until the user types their own KM for that set.
  const withCardioKm = (name, s, field, value) => {
    const next = { ...s, [field]: value };
    if (missedSetKind(name) !== 'cardio') return next;
    if (field === 'distanceKm') return { ...next, distanceKmAuto: value === '' };
    if (field === 'time' && s.distanceKmAuto !== false) {
      const seconds = parseTimeStringToSeconds(value) || 0;
      next.distanceKm = seconds > 0 ? String(estimateCardioDistanceKm(name, seconds)) : '';
    }
    return next;
  };
  const addSet = (exIdx) => setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, sets: [...ex.sets, emptyMissedSet(ex.name)] }));
  const removeSet = (exIdx, setIdx) => setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) }));

  const handleSave = async () => {
    const toSave = toSavedMissedExercises(exercises);
    if (toSave.length === 0) {
      setError(exercises.length === 0 ? 'Add the exercise you missed first.' : 'Fill in at least one set.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(toSave, estimateMissedSetsKcal(toSave, bodyWeightKg));
    } catch (e) {
      setError(e?.message || 'Couldn\'t save. Try again.');
      setSaving(false);
    }
  };

  return createPortal(
    <>
      <div className="missed-ex-backdrop" role="dialog" aria-modal="true" aria-labelledby="missed-ex-title">
        <div className="missed-ex-sheet">
          <div className="missed-ex-header">
            <div>
              <h3 id="missed-ex-title">Add missed exercises</h3>
              <div className="missed-ex-sub">to {planName || 'this workout'} · {dateLabel}</div>
            </div>
            <button type="button" className="missed-ex-icon-btn" onClick={onClose} aria-label="Close" disabled={saving}><CloseIcon /></button>
          </div>

          <div className="missed-ex-body">
            {savedExerciseNames.length > 0 && (
              <button type="button" className="missed-ex-saved" onClick={() => setShowSaved(v => !v)} aria-expanded={showSaved}>
                <span className="missed-ex-saved-title"><LockIcon /> Already saved ({savedExerciseNames.length})</span>
                <span className="missed-ex-saved-names">{showSaved ? savedExerciseNames.join('\n') : savedExerciseNames.join(' · ')}</span>
              </button>
            )}

            {exercises.map((ex, exIdx) => {
              const kind = missedSetKind(ex.name);
              const cols = COLUMNS[kind];
              const alsoSaved = savedLower.has(ex.name.toLowerCase());
              return (
                <div key={ex.name} className="missed-ex-card">
                  <div className="missed-ex-card-head">
                    <span className="missed-ex-name">{ex.name}</span>
                    <span className="missed-ex-tag">{alsoSaved ? 'Extra sets' : 'Missed'}</span>
                    <button type="button" className="missed-ex-icon-btn" onClick={() => removeExercise(ex.name)} aria-label={`Remove ${ex.name}`}><BinIcon size={16} /></button>
                  </div>
                  <div className="missed-ex-grid missed-ex-grid-head" style={{ gridTemplateColumns: `28px repeat(${cols.length}, 1fr) 28px` }}>
                    <span>SET</span>{cols.map(([f, label]) => <span key={f}>{label}</span>)}<span />
                  </div>
                  {ex.sets.map((set, setIdx) => (
                    <div key={setIdx} className="missed-ex-grid" style={{ gridTemplateColumns: `28px repeat(${cols.length}, 1fr) 28px` }}>
                      <span className="missed-ex-setnum">{setIdx + 1}</span>
                      {cols.map(([field, label, mode]) => (
                        <input
                          key={field}
                          className="missed-ex-input"
                          aria-label={`${ex.name} set ${setIdx + 1} ${label.toLowerCase()}`}
                          inputMode={mode === 'time' ? 'numeric' : mode}
                          placeholder={mode === 'time' ? '00:00' : field === 'weight' ? (isBodyweightExercise(ex.name) ? 'BW' : 'kg') : '–'}
                          value={set[field]}
                          onChange={e => updateSet(exIdx, setIdx, field, mode === 'time' ? maskDigitsToTimeString(e.target.value) : e.target.value.replace(mode === 'decimal' ? /[^0-9.]/g : /\D/g, ''))}
                        />
                      ))}
                      <button type="button" className="missed-ex-icon-btn small" onClick={() => removeSet(exIdx, setIdx)} aria-label={`Remove set ${setIdx + 1}`} disabled={ex.sets.length <= 1}><CloseIcon /></button>
                    </div>
                  ))}
                  <button type="button" className="missed-ex-link" onClick={() => addSet(exIdx)}>+ Add set</button>
                </div>
              );
            })}

            <button type="button" className="missed-ex-add" onClick={() => setPickerOpen(true)}>
              <PlusIcon /> {exercises.length === 0 ? 'Choose missed exercise' : 'Add another missed exercise'}
            </button>
          </div>

          <div className="missed-ex-footer">
            {error && <div className="missed-ex-error" role="alert">{error}</div>}
            <button type="button" className="missed-ex-save" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : `Save to ${planName || 'this workout'}`}
            </button>
            <button type="button" className="missed-ex-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          </div>
        </div>
      </div>
      <ExercisePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        addedNames={exercises.map(ex => ex.name)}
        onAdd={addExercise}
        onRemove={removeExercise}
        creatorMode={creatorMode}
        coachId={coachId}
        clientUserId={clientUserId}
        clientName={clientName}
      />
    </>,
    document.body
  );
}
