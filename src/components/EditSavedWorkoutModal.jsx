import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { BinIcon } from './TimerIcons';
import { SetGrid, CloseIcon } from './SavedWorkoutSheetParts';
import { DEFAULT_BODY_WEIGHT_KG } from '../utils/liveWorkoutTimer';
import { buildEditableWorkout, applySetEdit, diffEditableWorkout } from '../utils/missedExercises';
import './WorkoutTracker.css';
import './AddMissedExercisesModal.css';

// "Edit workout" sheet, shared by the client (Home → Daily) and the coach
// (client Daily history). Starts from that day's saved workout_logs rows
// (`rows`); sets can be changed or removed, a whole exercise removed with
// its bin. Only what changed is handed to onSave({ changes, deletes,
// kcalDeltas }) — see databaseService.editSavedWorkout.
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

  const handleSave = async () => {
    if (remaining === 0) { setError('Keep at least one set in the workout.'); return; }
    const diff = diffEditableWorkout(exercises, bodyWeightKg);
    if (diff.error) { setError(diff.error); return; }
    if (diff.changes.length === 0 && diff.deletes.length === 0) { onClose(); return; }
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
        <div className="missed-ex-header">
          <div>
            <h3 id="edit-workout-title">Edit workout</h3>
            <div className="missed-ex-sub">{planName || 'Workout'} · {dateLabel}</div>
          </div>
          <button type="button" className="missed-ex-icon-btn" onClick={onClose} aria-label="Close" disabled={saving}><CloseIcon /></button>
        </div>

        <div className="missed-ex-body">
          {exercises.map((ex, exIdx) => {
            const visible = ex.sets.filter(s => !s.deleted);
            if (visible.length === 0) {
              return (
                <div key={ex.name} className="missed-ex-card removed">
                  <div className="missed-ex-card-head">
                    <span className="missed-ex-name">{ex.name}</span>
                    <span className="missed-ex-removed-label">Removed</span>
                    <button type="button" className="missed-ex-link" onClick={() => restoreExercise(exIdx)}>Undo</button>
                  </div>
                </div>
              );
            }
            const edited = ex.sets.some(s => s.deleted || JSON.stringify(s.values) !== JSON.stringify(s.original));
            return (
              <div key={ex.name} className={`missed-ex-card saved${edited ? ' edited' : ''}`}>
                <div className="missed-ex-card-head">
                  <span className="missed-ex-name">{ex.name}</span>
                  {edited && <span className="missed-ex-tag edited">Edited</span>}
                  <button type="button" className="missed-ex-icon-btn" onClick={() => removeExercise(exIdx)} aria-label={`Remove ${ex.name}`}><BinIcon size={16} /></button>
                </div>
                <SetGrid
                  name={ex.name}
                  sets={visible.map(s => s.values)}
                  onChange={(setIdx, field, value) => updateSet(exIdx, setIdx, field, value)}
                  onRemove={setIdx => removeSet(exIdx, setIdx)}
                />
              </div>
            );
          })}
        </div>

        <div className="missed-ex-footer">
          {error && <div className="missed-ex-error" role="alert">{error}</div>}
          <button type="button" className="missed-ex-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="missed-ex-cancel" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
