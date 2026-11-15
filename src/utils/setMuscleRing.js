// The small ring beside each set's tick in the logger (client WorkoutTracker
// and the coach's Live Log): how far this week's sets for the exercise's main
// muscle have got toward that muscle's weekly target, counting every ticked
// set up to and including this one. Same counting as the heat map / Muscle
// Balance (getWeeklyMuscleStats): working sets only, empty-kg or no-rep sets
// don't count, secondary muscles get a fraction — so the ring and the heat map
// can't disagree. "Full" is the target band's low end, the point where the
// heat map turns the muscle green (Optimal).

import { getWeeklyMuscleStats, getMuscleTargets, isCountableSet } from './muscleAnalytics.js';
import { getMuscleGroupsForExercise, getMuscleWeight } from './muscleGroups.js';
import { parseLocalDateString, shiftLocalDateString } from './dateUtils.js';

const isWarmupSet = (set) => !!set.isWarmup || set.setType === 'warmup';

/** Monday..Sunday (YYYY-MM-DD) of the week holding dateStr — the heat map's week. */
export function weekRangeFor(dateStr) {
  const d = parseLocalDateString(dateStr);
  const back = (d.getDay() + 6) % 7; // Mon → 0, Sun → 6
  const start = shiftLocalDateString(dateStr, -back);
  return [start, shiftLocalDateString(start, 6)];
}

/**
 * Ring state per set, keyed `${exIdx}-${setIdx}`. Every set of an exercise
 * that maps to a muscle gets an entry; warmups get none.
 *   { state: 'idle' | 'progress' | 'done' | 'none', fraction, muscle, sets, target }
 * 'idle' = not ticked yet (sets = the count so far, before this set);
 * 'none' = ticked but not counted (no kg / no reps).
 * @param {Array} savedLogs - this client's saved workout_logs rows
 * @param {Array} exercises - the open workout's exercises ({name, sets})
 * @param {string} logDate - the open workout's date (YYYY-MM-DD)
 * @param {string|null} level - beginner / intermediate / advanced
 */
export function getSetRingStates(savedLogs, exercises, logDate, level) {
  const out = {};
  if (!logDate || !Array.isArray(exercises) || exercises.length === 0) return out;
  const [start, end] = weekRangeFor(logDate);
  const counts = {};
  getWeeklyMuscleStats(savedLogs || [], start, end, { includeUntrained: true, level })
    .forEach(s => { counts[s.muscle] = s.totalSets; });
  const targets = getMuscleTargets(level);

  exercises.forEach((ex, exIdx) => {
    const muscles = getMuscleGroupsForExercise(ex?.name);
    (ex?.sets || []).forEach((set, setIdx) => {
      if (isWarmupSet(set) || muscles.length === 0) return;
      // Not ticked yet: a plain grey ring, so every row of the exercise has one.
      if (!set.isCompleted) {
        const main = muscles[0];
        out[`${exIdx}-${setIdx}`] = { state: 'idle', fraction: 0, muscle: main, sets: Math.round((counts[main] || 0) * 10) / 10, target: targets[main]?.min || 1 };
        return;
      }
      const row = {
        exercise_name: ex.name,
        weight_kg: parseFloat(set.weight) || 0,
        reps: parseInt(set.reps, 10) || 0,
        set_type: set.setType || 'normal',
      };
      const main = muscles[0];
      const target = targets[main]?.min || 1;
      if (!isCountableSet(row)) {
        out[`${exIdx}-${setIdx}`] = { state: 'none', fraction: 0, muscle: main, sets: Math.round((counts[main] || 0) * 10) / 10, target };
        return;
      }
      muscles.forEach(m => { counts[m] = (counts[m] || 0) + getMuscleWeight(ex.name, m); });
      const sets = Math.round(counts[main] * 10) / 10;
      out[`${exIdx}-${setIdx}`] = {
        state: sets >= target ? 'done' : 'progress',
        fraction: Math.min(1, sets / target),
        muscle: main,
        sets,
        target,
      };
    });
  });
  return out;
}
