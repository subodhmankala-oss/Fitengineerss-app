import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { BinIcon } from './TimerIcons';
import { SetGrid, SheetHeader } from './SavedWorkoutSheetParts';
import { DEFAULT_BODY_WEIGHT_KG } from '../utils/liveWorkoutTimer';
import { buildEditableWorkout, applySetEdit, diffEditableWorkout, savedSetLabel } from '../utils/missedExercises';
import './WorkoutTracker.css';
import './AddMissedExercisesModal.css';

// "Edit workout" sheet, shared by the client (Home → Daily) and the coach
// (client Daily history). Starts from that day's saved workout_logs rows
// (`rows`) laid out like the logger — every exercise's sets open, with the
// saved value in the SAVED column so a change is easy to see. Sets can be
// changed or removed, a whole exercise removed with its bin. Only what
// changed is handed to onSave({ changes, deletes, kcalDeltas }) — see
// databaseService.editSavedWorkout.
export default function EditSavedWorkoutModal({ open, onClose, onSave, rows = [], dateLabel, planName, bodyWeightKg = DEFAULT_BODY_WEIGHT_KG }) {
  const [exercises, setExercises] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fresh copy of the saved workout on every open.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setExercises(buildEditableWorkout(rows)); setError(''); setSaving(false); }
  }

  if (!open) return null;

  const mapSets = (exIdx, fn) => {
    setError('');
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, sets: fn(ex.sets, ex.name) }));
  };
  const updateSet = (exIdx, visibleIdx, field, value) => mapSets(exIdx, (sets, name) => {
    const target = sets.filter(s => !s.deleted)[visibleIdx];
    return sets.map(s => s !== target ? s : { ...s, values: applySetEdit(name, s.values, field, value) });
  });
  const removeSet = (exIdx, visibleIdx) => mapSets(exIdx, sets => {
    const target = sets.filter(s => !s.deleted)[visibleIdx];
    return sets.map(s => s !== target ? s : { ...s, deleted: true });
  });
  const removeExercise = (exIdx) => mapSets(exIdx, sets => sets.map(s => ({ ...s, deleted: true })));
  const restoreExercise = (exIdx) => mapSets(exIdx, sets => sets.map(s => ({ ...s, deleted: false, values: s.original })));

  const remaining = exercises.reduce((n, ex) => n + ex.sets.filter(s => !s.deleted).length, 0);
  const diff = diffEditableWorkout(exercises, bodyWeightKg);
  const changeCount = diff.error ? null : diff.changes.length + diff.deletes.length;
  const kcalDelta = diff.error ? 0 : Math.round(Object.values(diff.kcalDeltas).reduce((a, b) => a + b, 0));

  const handleSave = async () => {
    if (remaining === 0) { setError('Keep at least one set in the workout.'); return; }
    if (diff.error) { setError(diff.error); return; }
    if (changeCount === 0) { onClose(); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(diff);
    } catch (e) {
      setError(e?.message || 'Couldn\'t save your changes. Try again.');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="missed-ex-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-workout-title">
      <div className="missed-ex-sheet">
        <SheetHeader
          title="Edit workout"
          titleId="edit-workout-title"
          subtitle={`${planName || 'Workout'} · ${dateLabel}`}
          onClose={onClose}
          disabled={saving}
        />

        <div className="missed-ex-body">
          {exercises.map((ex, exIdx) => {
            const visible = ex.sets.filter(s => !s.deleted);
            if (visible.length === 0) {
              return (
                <div key={ex.name} className="form-exercise-card hevy-exercise-card saved-sheet-card-removed">
                  <div className="ex-card-header">
                    <h5>{ex.name}</h5>
                    <span className="saved-sheet-removed">
                      Removed
                      <button type="button" className="saved-sheet-undo" onClick={() => restoreExercise(exIdx)}>Undo</button>
                    </span>
                  </div>
                </div>
              );
            }
            const removedSets = ex.sets.length - visible.length;
            return (
              <div key={ex.name} className="form-exercise-card hevy-exercise-card">
                <div className="ex-card-header">
                  <h5>{ex.name}</h5>
                  <button type="button" className="saved-sheet-icon-btn" onClick={() => removeExercise(exIdx)} aria-label={`Remove ${ex.name}`}><BinIcon size={18} /></button>
                </div>
                <SetGrid
                  name={ex.name}
                  sets={visible.map(s => s.values)}
                  setTypes={visible.map(s => s.setType)}
                  prev={visible.map(s => savedSetLabel(ex.name, s.original))}
                  prevTitle="SAVED"
                  changed={i => JSON.stringify(visible[i].values) !== JSON.stringify(visible[i].original)}
                  onChange={(setIdx, field, value) => updateSet(exIdx, setIdx, field, value)}
                  onRemove={setIdx => removeSet(exIdx, setIdx)}
                />
                {removedSets > 0 && (
                  <div className="saved-sheet-note">{removedSets} set{removedSets === 1 ? '' : 's'} will be removed</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="missed-ex-footer">
          {error && <div className="missed-ex-error" role="alert">{error}</div>}
          {changeCount > 0 && (
            <div className="saved-sheet-impact">
              {changeCount} change{changeCount === 1 ? '' : 's'}
              {kcalDelta !== 0 && ` · ${kcalDelta > 0 ? '+' : '−'}${Math.abs(kcalDelta)} kcal`}
            </div>
          )}
          <button type="button" className="missed-ex-save" onClick={handleSave} disabled={saving || changeCount === 0}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="missed-ex-cancel" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
