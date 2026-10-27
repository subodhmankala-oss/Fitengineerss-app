import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import ExercisePickerModal from './ExercisePickerModal';
import { BinIcon } from './TimerIcons';
import { SetGrid, PlusIcon, LockIcon, CloseIcon } from './SavedWorkoutSheetParts';
import { estimateMissedSetsKcal, DEFAULT_BODY_WEIGHT_KG } from '../utils/liveWorkoutTimer';
import { emptyMissedSet, toSavedMissedExercises, applySetEdit } from '../utils/missedExercises';
import './WorkoutTracker.css';
import './AddMissedExercisesModal.css';

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
      ...ex, sets: ex.sets.map((s, j) => j !== setIdx ? s : applySetEdit(ex.name, s, field, value))
    }));
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
              const alsoSaved = savedLower.has(ex.name.toLowerCase());
              return (
                <div key={ex.name} className="missed-ex-card">
                  <div className="missed-ex-card-head">
                    <span className="missed-ex-name">{ex.name}</span>
                    <span className="missed-ex-tag">{alsoSaved ? 'Extra sets' : 'Missed'}</span>
                    <button type="button" className="missed-ex-icon-btn" onClick={() => removeExercise(ex.name)} aria-label={`Remove ${ex.name}`}><BinIcon size={16} /></button>
                  </div>
                  <SetGrid
                    name={ex.name}
                    sets={ex.sets}
                    onChange={(setIdx, field, value) => updateSet(exIdx, setIdx, field, value)}
                    onRemove={setIdx => removeSet(exIdx, setIdx)}
                    canRemove={() => ex.sets.length > 1}
                  />
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
