import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import MuscleThumbnail from './MuscleAnalytics/MuscleThumbnail';
import { getMuscleGroupsForExercise } from '../utils/muscleGroups';
import { equipmentLabel, isSameExerciseName, swapAlternatives, swapMatchPercent } from '../utils/aiWorkoutCatalog';
import { exerciseNameKey, libraryExerciseId } from '../utils/exerciseName';
import { isBodyweightExercise } from '../data/exerciseLibrary';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './LiveSwapSheet.css';

// "Swap exercise" from a logger card's ≡ menu — client logger and coach
// Live Log alike (logic in utils/exerciseSwap). Same bottom sheet as This
// week's muscles; rows are the Add Exercise picker's (round muscle icon,
// name, detail line) plus the client's own Last weight and a match %.
// Tap a row to pick it, then the bottom button swaps; tap the icon to watch
// the Form Guide (which has its own Swap button — see onWatch).
//
// catalog: the coach's library (utils/loadAiCatalog), null while loading.
// getLast(name, exerciseId) → "14 kg × 10" | null.
// keepPlan: { label: 'Keep in my plan', planName } when today's workout came
// from a saved plan holding this exercise (utils/exerciseSwap
// findKeepablePlan), else null and the swap is for today only. onSwap and
// onWatch get the record and { keep }.

export const SwapIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" />
  </svg>
);

const equipmentOf = (name) => equipmentLabel(name) || (isBodyweightExercise(name) ? 'Bodyweight' : null);

export default function LiveSwapSheet({ exercise, catalog, excludeNames = [], getLast, keepPlan = null, onWatch, onSwap, onClose }) {
  const [query, setQuery] = useState('');
  const [equipment, setEquipment] = useState('All');
  const [picked, setPicked] = useState(null);
  const [keep, setKeep] = useState(false);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const self = useMemo(
    () => (catalog || []).find(e => exerciseNameKey(e.name) === exerciseNameKey(exercise.name)) || null,
    [catalog, exercise.name]
  );

  // Best matches first; typing searches the whole library instead.
  const options = useMemo(() => {
    if (!catalog) return [];
    const exclude = new Set([exercise.name, ...excludeNames].map(exerciseNameKey));
    const q = query.trim().toLowerCase();
    const pool = q
      ? catalog.filter(e => !exclude.has(exerciseNameKey(e.name)) && e.name.toLowerCase().includes(q)).slice(0, 40)
      : swapAlternatives(exercise.name, catalog, { exclude: excludeNames, limit: 24 });
    return pool
      .filter(e => !isSameExerciseName(exercise.name, e.name))
      .map(e => ({ ...e, match: swapMatchPercent(exercise.name, e, catalog), equipment: equipmentOf(e.name) }))
      .sort((a, b) => b.match - a.match);
  }, [catalog, exercise.name, excludeNames, query]);

  const pills = useMemo(() => {
    const seen = new Set(options.map(o => o.equipment).filter(Boolean));
    return ['All', ...['Dumbbell', 'Barbell', 'Machine', 'Cable', 'Kettlebell', 'Band', 'Bodyweight'].filter(p => seen.has(p))];
  }, [options]);
  const shown = equipment === 'All' ? options : options.filter(o => o.equipment === equipment);
  const pickedOption = options.find(o => o.name === picked) || null;

  const toRecord = (o) => ({ name: o.name, exerciseId: libraryExerciseId(o), record: o });
  const todo = exercise.sets.filter(s => !s.isCompleted);
  const reps = todo[0]?.reps;
  const done = exercise.sets.length - todo.length;

  return createPortal(
    <div className="lss-root" role="dialog" aria-modal="true" aria-label={`Swap ${exercise.name}`}>
      <div className="lss-backdrop" onClick={onClose} />
      <div className="lss-sheet">
        <button type="button" className="lss-grab" aria-label="Close" onClick={onClose}><span /></button>
        <div className="lss-head">
          <span className="lss-title">Swap {exercise.name}</span>
          <span className="lss-sub">
            {[self?.muscle, todo.length ? `${todo.length}${reps ? ` × ${reps}` : ''}` : null].filter(Boolean).join(' · ')}
          </span>
        </div>
        {done > 0 && (
          <p className="lss-note">{done} ticked set{done === 1 ? '' : 's'} stay{done === 1 ? 's' : ''} on {exercise.name}; the new exercise gets the other {todo.length}.</p>
        )}
        <input
          className="exercise-search-input lss-search"
          type="search"
          placeholder="Search exercises"
          value={query}
          onChange={e => { setQuery(e.target.value); setEquipment('All'); }}
        />
        {pills.length > 2 && (
          <div className="lss-pills">
            {pills.map(p => (
              <button key={p} type="button" className={`filter-tag-btn ${equipment === p ? 'active' : ''}`} onClick={() => setEquipment(p)}>{p}</button>
            ))}
          </div>
        )}
        <div className="lss-sec">{query.trim() ? 'Search results' : `Best match · ${self?.muscle ? `same muscle` : 'similar'}`}</div>
        <div className="lss-list">
          {!catalog ? (
            <p className="lss-empty">Loading your exercise library…</p>
          ) : shown.length === 0 ? (
            <p className="lss-empty">{query.trim() ? 'No exercise matches that name.' : 'No similar exercises found — search above.'}</p>
          ) : shown.map(o => {
            const last = getLast ? getLast(o.name, libraryExerciseId(o)) : null;
            const muscle = getMuscleGroupsForExercise(o.name)[0];
            return (
              <div
                key={o.name}
                role="button"
                tabIndex={0}
                className={`lss-item ${picked === o.name ? 'on' : ''}`}
                aria-pressed={picked === o.name}
                onClick={() => setPicked(o.name)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(o.name); } }}
              >
                <button
                  type="button"
                  className="lss-icon"
                  title={`Watch how to do ${o.name}`}
                  aria-label={`Watch how to do ${o.name}`}
                  onClick={e => { e.stopPropagation(); onWatch(toRecord(o), { keep: !!keepPlan && keep }); }}
                >
                  {muscle ? <MuscleThumbnail muscle={muscle} color="#60a5fa" size={40} /> : <span className="lss-mono">{o.name.charAt(0)}</span>}
                  <span className="lss-play" aria-hidden="true">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 21 12 6 21" /></svg>
                  </span>
                </button>
                <div className="lss-info">
                  <strong>{o.name}</strong>
                  <span>{[o.equipment, last ? <>Last <b>{last}</b></> : 'Not done yet'].filter(Boolean).reduce((acc, part, i) => (i ? [...acc, ' · ', part] : [part]), [])}</span>
                </div>
                <div className="lss-match"><b>{o.match}%</b><small>match</small></div>
              </div>
            );
          })}
        </div>
        <div className="lss-foot">
          {keepPlan && (
            <>
              <div className="lss-scope" role="radiogroup" aria-label="How long to swap">
                {[[false, 'Today only'], [true, keepPlan.label]].map(([value, label]) => (
                  <label key={label} className={keep === value ? 'on' : ''}>
                    <input type="radio" name="lss-scope" checked={keep === value} onChange={() => setKeep(value)} />
                    {label}
                  </label>
                ))}
              </div>
              {keep && (
                <p className="lss-scope-note">
                  “{keepPlan.planName}” will have {pickedOption ? pickedOption.name : 'the new exercise'} instead of {exercise.name} from now on.
                </p>
              )}
            </>
          )}
          <button
            type="button"
            className="lss-go"
            disabled={!pickedOption}
            onClick={() => pickedOption && onSwap(toRecord(pickedOption), { keep: !!keepPlan && keep })}
          >
            {pickedOption ? <><SwapIcon /><span>Swap to {pickedOption.name}</span></> : <span>Pick an exercise</span>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
