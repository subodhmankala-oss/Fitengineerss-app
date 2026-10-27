import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { BinIcon } from './TimerIcons';
import { SetGrid, SheetHeader, ExerciseAvatar, PencilLineIcon, ChevronIcon, FlameIcon } from './SavedWorkoutSheetParts';
import { DEFAULT_BODY_WEIGHT_KG } from '../utils/liveWorkoutTimer';
import { buildEditableWorkout, applySetEdit, diffEditableWorkout, summarizeSets } from '../utils/missedExercises';
import './WorkoutTracker.css';
import './AddMissedExercisesModal.css';

// "Edit workout" sheet, shared by the client (Home → Daily) and the coach
// (client Daily history). Starts from that day's saved workout_logs rows
// (`rows`), each exercise folded to a one-line summary until tapped open;
// sets can be changed or removed, a whole exercise removed with its bin.
// Only what changed is handed to onSave({ changes, deletes, kcalDeltas }) —
// see databaseService.editSavedWorkout.
export default function EditSavedWorkoutModal({ open, onClose, onSave, rows = [], dateLabel, planName, bodyWeightKg = DEFAULT_BODY_WEIGHT_KG }) {
  const [exercises, setExercises] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fresh copy of the saved workout on every open, all folded.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setExercises(buildEditableWorkout(rows)); setExpanded(new Set()); setError(''); setSaving(false); }
  }

  if (!open) return null;

  const toggle = (name) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
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
          icon={<PencilLineIcon size={20} />}
          tone="edit"
          title="Edit workout"
          titleId="edit-workout-title"
          subtitle={<><strong>{planName || 'Workout'}</strong> · {dateLabel}</>}
          onClose={onClose}
          disabled={saving}
        />

        <div className="missed-ex-body">
          <div className="saved-sheet-stats">
            <span><strong>{exercises.filter(ex => ex.sets.some(s => !s.deleted)).length}</strong> exercises</span>
            <span><strong>{remaining}</strong> sets</span>
            <span className="saved-sheet-stats-hint">Tap an exercise to edit it</span>
          </div>

          {exercises.map((ex, exIdx) => {
            const visible = ex.sets.filter(s => !s.deleted);
            if (visible.length === 0) {
              return (
                <div key={ex.name} className="missed-ex-card removed">
                  <div className="missed-ex-card-head">
                    <ExerciseAvatar name={ex.name} color="#94a3b8" />
                    <div className="saved-sheet-ex-titles">
                      <span className="missed-ex-name">{ex.name}</span>
                      <span className="saved-sheet-ex-summary">Will be removed</span>
                    </div>
                    <button type="button" className="saved-sheet-undo" onClick={() => restoreExercise(exIdx)}>Undo</button>
                  </div>
                </div>
              );
            }
            const edited = ex.sets.some(s => s.deleted || JSON.stringify(s.values) !== JSON.stringify(s.original));
            const isOpen = expanded.has(ex.name);
            return (
              <div key={ex.name} className={`missed-ex-card saved${edited ? ' edited' : ''}${isOpen ? ' open' : ''}`}>
                <div className="missed-ex-card-head">
                  <button type="button" className="saved-sheet-toggle" onClick={() => toggle(ex.name)} aria-expanded={isOpen}>
                    <ExerciseAvatar name={ex.name} color={edited ? '#fbbf24' : '#60a5fa'} />
                    <span className="saved-sheet-ex-titles">
                      <span className="missed-ex-name">{ex.name}</span>
                      <span className="saved-sheet-ex-summary">{visible.length} set{visible.length === 1 ? '' : 's'} · {summarizeSets(ex.name, visible.map(s => s.values))}</span>
                    </span>
                    {edited && <span className="missed-ex-tag edited">Edited</span>}
                    <ChevronIcon open={isOpen} />
                  </button>
                  <button type="button" className="missed-ex-icon-btn" onClick={() => removeExercise(exIdx)} aria-label={`Remove ${ex.name}`}><BinIcon size={16} /></button>
                </div>
                {isOpen && (
                  <SetGrid
                    name={ex.name}
                    sets={visible.map(s => s.values)}
                    onChange={(setIdx, field, value) => updateSet(exIdx, setIdx, field, value)}
                    onRemove={setIdx => removeSet(exIdx, setIdx)}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="missed-ex-footer">
          {error && <div className="missed-ex-error" role="alert">{error}</div>}
          {changeCount > 0 && (
            <div className="saved-sheet-impact">
              <span>{changeCount} change{changeCount === 1 ? '' : 's'}</span>
              {kcalDelta !== 0 && (
                <span className={`saved-sheet-kcal ${kcalDelta > 0 ? 'up' : 'down'}`}><FlameIcon /> {kcalDelta > 0 ? '+' : '−'}{Math.abs(kcalDelta)} kcal</span>
              )}
            </div>
          )}
          <button type="button" className={`missed-ex-save${changeCount === 0 ? ' idle' : ''}`} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : changeCount > 0 ? `Save ${changeCount} change${changeCount === 1 ? '' : 's'}` : changeCount === 0 ? 'No changes yet' : 'Save changes'}
          </button>
          <button type="button" className="missed-ex-cancel" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
