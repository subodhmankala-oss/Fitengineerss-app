import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import ExercisePickerModal from './ExercisePickerModal';
import { BinIcon } from './TimerIcons';
import { SetGrid, SheetHeader, PlusIcon } from './SavedWorkoutSheetParts';
import { estimateMissedSetsKcal, DEFAULT_BODY_WEIGHT_KG } from '../utils/liveWorkoutTimer';
import { emptyMissedSet, toSavedMissedExercises, applySetEdit, previousFormSets, savedSetLabel } from '../utils/missedExercises';
import './WorkoutTracker.css';
import './AddMissedExercisesModal.css';

// How many saved exercise names show before "+N more".
const SAVED_NAMES_SHOWN = 4;

// "Add missed exercise" sheet, shared by the client (Home → Daily) and the
// coach (client History card), laid out like the logger. The exercises
// already saved that day stay as they are; only new ones are entered here,
// then handed to onSave(exercises, addedCalories), which does the append
// (databaseService.appendMissedExercises). PREV is the exercise's sets from
// the last earlier day in `history` (saved workout_logs rows); those numbers
// only show as hints — no default weights, the boxes start empty.
export default function AddMissedExercisesModal({
  open, onClose, onSave, dateLabel, planName, savedExerciseNames = [], logDate = '', history = [],
  bodyWeightKg = DEFAULT_BODY_WEIGHT_KG, creatorMode = 'client', coachId = null, clientUserId = null, clientName = ''
}) {
  const [exercises, setExercises] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAllSaved, setShowAllSaved] = useState(false);

  // Fresh form on every open.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setExercises([]); setError(''); setSaving(false); setShowAllSaved(false); setPickerOpen(true); }
  }

  if (!open) return null;

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

  const toSave = toSavedMissedExercises(exercises);
  const filledSets = toSave.reduce((n, ex) => n + ex.sets.length, 0);
  const addedKcal = Math.round(estimateMissedSetsKcal(toSave, bodyWeightKg));

  const handleSave = async () => {
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

  const savedShown = showAllSaved ? savedExerciseNames : savedExerciseNames.slice(0, SAVED_NAMES_SHOWN);
  const savedHidden = savedExerciseNames.length - savedShown.length;

  return createPortal(
    <>
      <div className="missed-ex-backdrop" role="dialog" aria-modal="true" aria-labelledby="missed-ex-title">
        <div className="missed-ex-sheet">
          <SheetHeader
            title="Add missed exercises"
            titleId="missed-ex-title"
            subtitle={`${planName || 'Workout'} · ${dateLabel}`}
            onClose={onClose}
            disabled={saving}
          />

          <div className="missed-ex-body">
            {savedExerciseNames.length > 0 && (
              <div className="saved-sheet-already">
                Already saved: {savedShown.join(', ')}
                {savedHidden > 0 && (
                  <> <button type="button" className="saved-sheet-more" onClick={() => setShowAllSaved(true)}>+{savedHidden} more</button></>
                )}
              </div>
            )}

            {exercises.map((ex, exIdx) => {
              const prevSets = previousFormSets(ex.name, history, logDate);
              return (
              <div key={ex.name} className="form-exercise-card hevy-exercise-card">
                <div className="ex-card-header">
                  <h5>{ex.name}</h5>
                  <button type="button" className="saved-sheet-icon-btn" onClick={() => removeExercise(ex.name)} aria-label={`Remove ${ex.name}`}><BinIcon size={18} /></button>
                </div>
                <SetGrid
                  name={ex.name}
                  sets={ex.sets}
                  prev={ex.sets.map((_, i) => (prevSets[i] ? savedSetLabel(ex.name, prevSets[i]) : '—'))}
                  hints={prevSets}
                  onChange={(setIdx, field, value) => updateSet(exIdx, setIdx, field, value)}
                  onRemove={setIdx => removeSet(exIdx, setIdx)}
                  canRemove={() => ex.sets.length > 1}
                />
                <button type="button" className="btn-add-set-link" onClick={() => addSet(exIdx)}>+ Add Set</button>
              </div>
              );
            })}

            <button type="button" className="btn-secondary-sm btn-add-hevy-ex add-ex-fullwidth" onClick={() => setPickerOpen(true)}>
              <PlusIcon /> {exercises.length === 0 ? 'Choose missed exercise' : 'Add Exercise'}
            </button>
          </div>

          <div className="missed-ex-footer">
            {error && <div className="missed-ex-error" role="alert">{error}</div>}
            {filledSets > 0 && (
              <div className="saved-sheet-impact">
                {filledSets} set{filledSets === 1 ? '' : 's'} to add{addedKcal > 0 && ` · +${addedKcal} kcal`}
              </div>
            )}
            <button type="button" className="missed-ex-save" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save to workout'}
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
