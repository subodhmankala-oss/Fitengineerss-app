import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import ExercisePickerModal from './ExercisePickerModal';
import { BinIcon } from './TimerIcons';
import { SetGrid, SheetHeader, ExerciseAvatar, PlusIcon, LockIcon, FlameIcon } from './SavedWorkoutSheetParts';
import { estimateMissedSetsKcal, DEFAULT_BODY_WEIGHT_KG } from '../utils/liveWorkoutTimer';
import { emptyMissedSet, toSavedMissedExercises, applySetEdit, isFilledMissedSet, summarizeSets } from '../utils/missedExercises';
import './WorkoutTracker.css';
import './AddMissedExercisesModal.css';

// How many saved exercise chips show before "+N more".
const SAVED_CHIPS_SHOWN = 6;

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
  const [showAllSaved, setShowAllSaved] = useState(false);

  // Fresh form on every open.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setExercises([]); setError(''); setSaving(false); setShowAllSaved(false); setPickerOpen(true); }
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

  const chips = showAllSaved ? savedExerciseNames : savedExerciseNames.slice(0, SAVED_CHIPS_SHOWN);
  const hiddenChips = savedExerciseNames.length - chips.length;

  return createPortal(
    <>
      <div className="missed-ex-backdrop" role="dialog" aria-modal="true" aria-labelledby="missed-ex-title">
        <div className="missed-ex-sheet">
          <SheetHeader
            icon={<PlusIcon size={20} />}
            tone="add"
            title="Add missed exercises"
            titleId="missed-ex-title"
            subtitle={<>to <strong>{planName || 'this workout'}</strong> · {dateLabel}</>}
            onClose={onClose}
            disabled={saving}
          />

          <div className="missed-ex-body">
            {savedExerciseNames.length > 0 && (
              <div className="saved-sheet-saved">
                <div className="saved-sheet-saved-title"><LockIcon /> Already in this workout · {savedExerciseNames.length}</div>
                <div className="saved-sheet-chips">
                  {chips.map(n => <span key={n} className="saved-sheet-chip">{n}</span>)}
                  {hiddenChips > 0 && (
                    <button type="button" className="saved-sheet-chip more" onClick={() => setShowAllSaved(true)}>+{hiddenChips} more</button>
                  )}
                </div>
              </div>
            )}

            {exercises.length === 0 && (
              <div className="saved-sheet-empty">
                <div className="saved-sheet-empty-title">What did you miss?</div>
                <div className="saved-sheet-empty-sub">Pick the exercise, enter its sets, and it joins this workout.</div>
              </div>
            )}

            {exercises.map((ex, exIdx) => {
              const alsoSaved = savedLower.has(ex.name.toLowerCase());
              const filled = ex.sets.filter(s => isFilledMissedSet(ex.name, s));
              return (
                <div key={ex.name} className="missed-ex-card new">
                  <div className="missed-ex-card-head">
                    <ExerciseAvatar name={ex.name} color="#34d399" />
                    <div className="saved-sheet-ex-titles">
                      <span className="missed-ex-name">{ex.name}</span>
                      <span className="saved-sheet-ex-summary">{filled.length > 0 ? summarizeSets(ex.name, filled) : 'Enter your sets'}</span>
                    </div>
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
                  <button type="button" className="saved-sheet-add-set" onClick={() => addSet(exIdx)}>+ Add set</button>
                </div>
              );
            })}

            <button type="button" className="missed-ex-add" onClick={() => setPickerOpen(true)}>
              <PlusIcon /> {exercises.length === 0 ? 'Choose missed exercise' : 'Add another missed exercise'}
            </button>
          </div>

          <div className="missed-ex-footer">
            {error && <div className="missed-ex-error" role="alert">{error}</div>}
            {filledSets > 0 && (
              <div className="saved-sheet-impact">
                <span>{filledSets} set{filledSets === 1 ? '' : 's'} to add</span>
                {addedKcal > 0 && <span className="saved-sheet-kcal up"><FlameIcon /> +{addedKcal} kcal</span>}
              </div>
            )}
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
