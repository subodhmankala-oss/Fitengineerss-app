// Live numbers for the two cards above the workout logger (client
// WorkoutTracker and coach Live Log): which muscles today's ticked sets
// worked, where the week stands for the muscle just trained, how many kg
// have been lifted, and whether the set just ticked beat last time.
//
// Everything is computed from the logger's own exercise list — ticked
// (isCompleted) sets only — turned into the same row shape workout_logs
// uses, so the counting rules are exactly the Muscles tab's
// (getWeeklyMuscleStats / getSetVolumeKg), not a second copy of them.

import { MUSCLE_GROUPS, getMuscleGroupsForExercise, getMuscleWeight } from './muscleGroups.js';
import { getWeeklyMuscleStats, getSetVolumeKg, MUSCLE_TARGETS } from './muscleAnalytics.js';
import { parseLocalDateString, getLocalDateString, shiftLocalDateString } from './dateUtils.js';
import { isCardioExercise, isTimedExercise } from '../data/exerciseLibrary.js';

const isWarmupSet = (set) => !!set.isWarmup || set.setType === 'warmup';

/**
 * Ticked sets as workout_logs-shaped rows (log_date, exercise_name,
 * weight_kg, reps, set_type). Unticked sets are left out: only work the
 * client has actually done counts.
 */
export function tickedSetRows(exercises, logDate) {
  const rows = [];
  (exercises || []).forEach(ex => {
    (ex.sets || []).forEach((set, i) => {
      if (!set.isCompleted) return;
      rows.push({
        log_date: logDate,
        exercise_name: ex.name,
        set_number: i + 1,
        weight_kg: parseFloat(set.weight) || 0,
        reps: parseInt(set.reps, 10) || 0,
        set_type: isWarmupSet(set) ? 'warmup' : (set.setType || 'normal'),
        completed_at: set.completedAt || null,
        // When the set was ticked — what recovery reads for saved rows.
        created_at: set.completedAt ? new Date(set.completedAt).toISOString() : null,
      });
    });
  });
  return rows;
}

// Monday–Sunday week (YYYY-MM-DD) holding `dateStr` — same week the
// Muscles tab's "This week" uses (getStartOfWeek in WorkoutProgressDashboard).
export function weekBoundsFor(dateStr) {
  const d = parseLocalDateString(dateStr || getLocalDateString());
  const day = d.getDay();
  const start = getLocalDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + (day === 0 ? -6 : 1)));
  return [start, shiftLocalDateString(start, 6)];
}

/**
 * The muscle card's numbers.
 * @param {Array} savedLogs - this client's saved workout_logs rows
 * @param {Array} exercises - the logger's exercise list
 * @param {string} logDate - the session's date
 * @returns {{ worked: Array<{muscle, sets}>, focus: null | {muscle, sets, target, left} }}
 *   worked: muscles today's ticked sets hit, most-worked first.
 *   focus: the main muscle of the most recently ticked exercise, with its
 *   week total (saved + ticked today) against the Muscles tab's target.
 */
export function liveMuscleSummary(savedLogs, exercises, logDate) {
  const rows = tickedSetRows(exercises, logDate).filter(r => r.set_type !== 'warmup');

  const today = {};
  rows.forEach(r => {
    getMuscleGroupsForExercise(r.exercise_name).forEach(m => {
      today[m] = (today[m] || 0) + getMuscleWeight(r.exercise_name, m);
    });
  });
  const worked = Object.entries(today)
    .map(([muscle, sets]) => ({ muscle, sets: Math.round(sets * 100) / 100 }))
    .sort((a, b) => b.sets - a.sets || MUSCLE_GROUPS.indexOf(a.muscle) - MUSCLE_GROUPS.indexOf(b.muscle));

  // Most recently ticked row whose exercise has a main muscle (cardio has none).
  const latest = rows
    .filter(r => getMuscleGroupsForExercise(r.exercise_name).length > 0)
    .reduce((best, r) => (!best || (r.completed_at || 0) >= (best.completed_at || 0) ? r : best), null);
  if (!latest) return { worked, focus: null };

  const muscle = getMuscleGroupsForExercise(latest.exercise_name)[0];
  const [start, end] = weekBoundsFor(logDate);
  const stat = getWeeklyMuscleStats([...(savedLogs || []), ...rows], start, end, { includeUntrained: true })
    .find(s => s.muscle === muscle);
  const sets = stat ? stat.sets : 0;
  const target = MUSCLE_TARGETS[muscle].target;
  return { worked, focus: { muscle, sets, target, left: Math.max(0, Math.ceil(target - sets)) } };
}

/** kg lifted by today's ticked sets (weight × reps, same rules as Volume). */
export function liftedKg(exercises, logDate) {
  const total = tickedSetRows(exercises, logDate).reduce((sum, r) => sum + getSetVolumeKg(r), 0);
  return Math.round(total * 10) / 10;
}

// Everyday things to compare a session's total against, lightest first.
// Rough real-world weights; the point is "that's a car!", not precision.
export const LIFT_OBJECTS = [
  { key: 'bicycle', label: 'a bicycle', kg: 15 },
  { key: 'scooter', label: 'a scooter', kg: 110 },
  { key: 'motorbike', label: 'a motorbike', kg: 200 },
  { key: 'car', label: 'a small car', kg: 900 },
  { key: 'suv', label: 'a big car', kg: 2000 },
  { key: 'bus', label: 'a minibus', kg: 4000 },
  { key: 'truck', label: 'a truck', kg: 10000 },
];

/** The heaviest object `kg` has passed (null below the first) and the next one up. */
export function liftObjectFor(kg) {
  let reached = null;
  for (const o of LIFT_OBJECTS) if (kg >= o.kg) reached = o;
  const next = LIFT_OBJECTS.find(o => o.kg > kg) || null;
  return { reached, next };
}

/**
 * True when a completed set beats the same set last time: more weight
 * without fewer reps, or more reps without less weight. Matching last time
 * exactly (the logger pre-fills from it) is not a best. Only weight × reps
 * sets — cardio, timed holds and warm-ups never count.
 */
export function beatsLastTime(exName, set, prev) {
  if (!set || !prev || isWarmupSet(set)) return false;
  if (isCardioExercise(exName) || isTimedExercise(exName)) return false;
  const w = parseFloat(set.weight) || 0, r = parseInt(set.reps, 10) || 0;
  const pw = parseFloat(prev.weight) || 0, pr = parseInt(prev.reps, 10) || 0;
  if (r <= 0 || pr <= 0) return false;
  return (w > pw && r >= pr) || (w >= pw && r > pr);
}
