// "Add missed exercise" — adding exercises a client forgot to log to a
// workout that's already saved (see databaseService.appendMissedExercises).
import { getLocalDateString, shiftLocalDateString } from './dateUtils';
import { isCardioExercise, isTimedExercise, isBodyweightExercise, isWarmupExercise } from '../data/exerciseLibrary';
import { parseTimeStringToSeconds } from './liveWorkoutTimer';

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

// The form's exercises → the saved-set shape saveWorkoutSession uses, keeping
// only filled sets and exercises that still have any.
export function toSavedMissedExercises(exercises) {
  return exercises
    .map(ex => {
      const kind = missedSetKind(ex.name);
      const sets = ex.sets.filter(s => isFilledMissedSet(ex.name, s)).map(s => (
        kind === 'cardio' ? { distanceKm: parseFloat(s.distanceKm) || 0, time: s.time || '' }
        : kind === 'timedWeighted' ? { time: s.time || '', weight: parseFloat(s.weight) || 0 }
        : kind === 'timed' ? { time: s.time || '' }
        : kind === 'repsOnly' ? { reps: parseInt(s.reps) || 0, weight: 0 }
        : { reps: parseInt(s.reps) || 0, weight: parseFloat(s.weight) || 0 }
      ));
      return { name: ex.name, ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}), sets };
    })
    .filter(ex => ex.sets.length > 0);
}
