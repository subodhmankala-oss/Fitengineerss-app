// "Add missed exercise" — adding exercises a client forgot to log to a
// workout that's already saved (see databaseService.appendMissedExercises).
import { getLocalDateString, shiftLocalDateString } from './dateUtils';
import { exerciseNameKey } from './exerciseName';
import { isCardioExercise, isTimedExercise, isBodyweightExercise, isWarmupExercise } from '../data/exerciseLibrary';
import { parseTimeStringToSeconds, formatSecondsToTimeString, estimateCardioDistanceKm, estimateSetKcal } from './liveWorkoutTimer';

// Only recent workouts can be added to, so old history isn't quietly rewritten.
export const MISSED_EXERCISE_WINDOW_DAYS = 7;

export function canAddMissedExercise(dateStr, today = getLocalDateString()) {
  if (!dateStr) return false;
  return dateStr <= today && dateStr >= shiftLocalDateString(today, -(MISSED_EXERCISE_WINDOW_DAYS - 1));
}

// A row saved more than this long after the first row of its own session was
// added later (one save is one bulk INSERT, so its rows share a created_at).
const ADDED_LATER_GAP_MS = 60 * 1000;

// { 'YYYY-MM-DD': Set(lower-cased exercise names added later) } from raw
// workout_logs rows. Only rows sharing a session_id with an earlier row
// count, so a second, separate workout on the same day isn't flagged.
export function addedLaterExercisesByDate(rows) {
  const firstAt = new Map();
  (rows || []).forEach(r => {
    if (!r.session_id || !r.created_at) return;
    const t = Date.parse(r.created_at);
    if (!firstAt.has(r.session_id) || t < firstAt.get(r.session_id)) firstAt.set(r.session_id, t);
  });
  const byDate = {};
  (rows || []).forEach(r => {
    if (!r.session_id || !r.created_at) return;
    if (Date.parse(r.created_at) - firstAt.get(r.session_id) <= ADDED_LATER_GAP_MS) return;
    (byDate[r.log_date] = byDate[r.log_date] || new Set()).add(String(r.exercise_name || '').toLowerCase());
  });
  return byDate;
}

// Which inputs a set of this exercise takes — same split as the logger.
export function missedSetKind(name) {
  if (isCardioExercise(name)) return 'cardio';
  if (isTimedExercise(name)) return isBodyweightExercise(name) ? 'timedWeighted' : 'timed';
  if (isWarmupExercise(name)) return 'repsOnly';
  return 'reps';
}

export function emptyMissedSet(name) {
  const kind = missedSetKind(name);
  if (kind === 'cardio') return { distanceKm: '', time: '' };
  if (kind === 'timedWeighted') return { time: '', weight: '' };
  if (kind === 'timed') return { time: '' };
  if (kind === 'repsOnly') return { reps: '' };
  return { weight: '', reps: '' };
}

// A set only counts once it has the value that defines it.
export function isFilledMissedSet(name, set) {
  const kind = missedSetKind(name);
  if (kind === 'cardio') return (parseFloat(set.distanceKm) || 0) > 0 || parseTimeStringToSeconds(set.time) > 0;
  if (kind === 'timed' || kind === 'timedWeighted') return parseTimeStringToSeconds(set.time) > 0;
  return (parseInt(set.reps) || 0) > 0;
}

// Columns a set row shows, per missedSetKind: [field, label, input mode].
export const MISSED_SET_COLUMNS = {
  reps: [['weight', 'KG', 'decimal'], ['reps', 'REPS', 'numeric']],
  repsOnly: [['reps', 'REPS', 'numeric']],
  cardio: [['distanceKm', 'KM', 'decimal'], ['time', 'TIME', 'time']],
  timed: [['time', 'TIME', 'time']],
  timedWeighted: [['weight', 'KG', 'decimal'], ['time', 'TIME', 'time']]
};

// One field edit. Same as the logger's handleCardioTimeEdit: typing a cardio
// time fills KM from an average pace, until KM is typed by hand.
export function applySetEdit(name, set, field, value) {
  const next = { ...set, [field]: value };
  if (missedSetKind(name) !== 'cardio') return next;
  if (field === 'distanceKm') return { ...next, distanceKmAuto: value === '' };
  if (field === 'time' && set.distanceKmAuto !== false) {
    const seconds = parseTimeStringToSeconds(value) || 0;
    next.distanceKm = seconds > 0 ? String(estimateCardioDistanceKm(name, seconds)) : '';
  }
  return next;
}

// One form set → the saved-set shape saveWorkoutSession uses.
export function toSavedSet(name, s) {
  const kind = missedSetKind(name);
  if (kind === 'cardio') return { distanceKm: parseFloat(s.distanceKm) || 0, time: s.time || '' };
  if (kind === 'timedWeighted') return { time: s.time || '', weight: parseFloat(s.weight) || 0 };
  if (kind === 'timed') return { time: s.time || '' };
  if (kind === 'repsOnly') return { reps: parseInt(s.reps) || 0, weight: 0 };
  return { reps: parseInt(s.reps) || 0, weight: parseFloat(s.weight) || 0 };
}

// The form's exercises → the saved-set shape, keeping only filled sets and
// exercises that still have any.
export function toSavedMissedExercises(exercises) {
  return exercises
    .map(ex => ({
      name: ex.name,
      ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
      sets: ex.sets.filter(s => isFilledMissedSet(ex.name, s)).map(s => toSavedSet(ex.name, s))
    }))
    .filter(ex => ex.sets.length > 0);
}

// A saved set as text for the SAVED column — same format as the logger's
// PREV column (getPreviousSessionSet): "5kg x 10", "BW x 12", "2km · 15:00".
export function savedSetLabel(name, s) {
  const kind = missedSetKind(name);
  if (kind === 'cardio') return s.distanceKm ? `${s.distanceKm}km${s.time ? ` · ${s.time}` : ''}` : (s.time || '—');
  if (kind === 'timed' || kind === 'timedWeighted') return s.time || '—';
  if (kind === 'repsOnly') return s.reps ? `${s.reps} reps` : '—';
  const weight = Number(s.weight) > 0 ? `${s.weight}kg` : isBodyweightExercise(name) ? 'BW' : '0kg';
  return `${weight} x ${s.reps || 0}`;
}

// The logger's PREV for an exercise added to the workout on `beforeDate`:
// its sets from the most recent earlier day it was saved, as form values
// (same name matching as the logger's PREV — exerciseNameKey).
export function previousFormSets(name, rows, beforeDate) {
  const key = exerciseNameKey(name);
  const earlier = (rows || []).filter(r => r.log_date < beforeDate && exerciseNameKey(r.exercise_name) === key);
  if (earlier.length === 0) return [];
  const lastDate = earlier.reduce((d, r) => (r.log_date > d ? r.log_date : d), '');
  return earlier
    .filter(r => r.log_date === lastDate)
    .sort((a, b) => (Number(a.set_number) || 0) - (Number(b.set_number) || 0))
    .map(r => rowToFormSet(name, r));
}

// ─── Edit workout ───

// A saved workout_logs row → the form's values. A 0 kg weight starts empty
// (shows the kg/BW placeholder), the same as a fresh set.
export function rowToFormSet(name, row) {
  const kind = missedSetKind(name);
  const weight = Number(row.weight_kg) > 0 ? String(row.weight_kg) : '';
  const time = formatSecondsToTimeString(row.cardio_duration_seconds);
  if (kind === 'cardio') return { distanceKm: row.distance_km != null ? String(row.distance_km) : '', time, distanceKmAuto: false };
  if (kind === 'timedWeighted') return { time, weight };
  if (kind === 'timed') return { time };
  if (kind === 'repsOnly') return { reps: String(row.reps ?? '') };
  return { weight, reps: String(row.reps ?? '') };
}

// One day's saved rows → [{ name, sets: [{ id, setType, original, values, deleted }] }],
// exercises in the order they were first saved, sets in saved order.
export function buildEditableWorkout(rows) {
  const ordered = [...(rows || [])].sort((a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
    (Number(a.session_row) || 0) - (Number(b.session_row) || 0) ||
    (Number(a.set_number) || 0) - (Number(b.set_number) || 0));
  const byName = new Map();
  ordered.forEach(row => {
    const name = row.exercise_name;
    if (!byName.has(name)) byName.set(name, { name, sets: [] });
    const values = rowToFormSet(name, row);
    byName.get(name).sets.push({ id: row.id, setType: row.set_type || null, original: values, values, deleted: false });
  });
  return [...byName.values()];
}

const sameSet = (name, a, b) => JSON.stringify(toSavedSet(name, a)) === JSON.stringify(toSavedSet(name, b));

// The edit form → what to send (databaseService.editSavedWorkout), or
// { error } when an edited set was emptied instead of removed.
export function diffEditableWorkout(exercises, bodyWeightKg) {
  const changes = [];
  const deletes = [];
  const kcalDeltas = {};
  for (const ex of exercises) {
    for (const s of ex.sets) {
      const oldKcal = estimateSetKcal(ex.name, toSavedSet(ex.name, s.original), bodyWeightKg);
      if (s.deleted) {
        deletes.push(s.id);
        kcalDeltas[s.id] = -oldKcal;
        continue;
      }
      if (sameSet(ex.name, s.values, s.original)) continue;
      if (!isFilledMissedSet(ex.name, s.values)) return { error: `Fill in ${ex.name} or remove that set.` };
      const set = toSavedSet(ex.name, s.values);
      changes.push({ id: s.id, name: ex.name, set });
      kcalDeltas[s.id] = Math.round((estimateSetKcal(ex.name, set, bodyWeightKg) - oldKcal) * 10) / 10;
    }
  }
  return { changes, deletes, kcalDeltas };
}
