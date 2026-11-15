// The small ring beside each set's tick in the logger (client WorkoutTracker
// and the coach's Live Log): how far this week's sets for the exercise's main
// muscle have got toward that muscle's weekly target, counting every ticked
// set up to and including this one. Same counting as the heat map / Muscle
// Balance (getWeeklyMuscleStats): working sets only, empty-kg or no-rep sets
// don't count, secondary muscles get a fraction — so the ring and the heat map
// can't disagree. "Full" is the target band's low end, the point where the
// heat map turns the muscle green (Optimal).

import { getWeeklyMuscleStats, getMuscleTargets, isCountableSet, classifyStatus } from './muscleAnalytics.js';
import { getMuscleGroupsForExercise, getMuscleWeight } from './muscleGroups.js';
import { parseLocalDateString, shiftLocalDateString } from './dateUtils.js';
import { getRegionBreakdownForMuscle, regionBand, ringRegionOf } from './muscleRegions.js';

// Slate for unticked and uncounted sets.
export const NOT_TRAINED = '#64748b';

// The Muscle Balance cards' status colours (WeeklyMuscleAnalytics.css
// .status-*): red Neglected, orange Undertrained, yellow Slightly Low,
// green Optimal, blue High Volume.
const STATUS_COLORS = {
  neglected: '#ef4444',
  undertrained: '#f97316',
  slightly_low: '#eab308',
  optimal: '#10b981',
  high_volume: '#3b82f6',
};

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
 *   { state: 'idle' | 'progress' | 'done' | 'none', fraction, muscle, region, sets, target, color }
 * `muscle` is what the ring counts: the region name for Back / Chest /
 * Shoulders exercises that hit one part ("Side Delts", region set), else
 * the whole muscle ("Biceps", region null) — same split as the
 * "behind this week" nudge (getMuscleGaps).
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
  const targets = getMuscleTargets(level);
  // Running set counts, keyed by muscle ("Shoulders") or muscle + region
  // ("Shoulders:Side Delts"), seeded from the week's saved sets on first use.
  const counts = {};
  getWeeklyMuscleStats(savedLogs || [], start, end, { includeUntrained: true, level })
    .forEach(s => { counts[s.muscle] = s.totalSets; });
  const regionKey = (muscle, region) => {
    const key = `${muscle}:${region}`;
    if (!(key in counts)) {
      counts[key] = getRegionBreakdownForMuscle(savedLogs || [], muscle, start, end, { level })
        .find(r => r.id === region)?.sets || 0;
    }
    return key;
  };
  // What a ring for this exercise tracks: its main muscle's region when it
  // has one (Lateral Raise → Side Delts), else the whole muscle.
  const trackFor = (name, muscle) => {
    const region = ringRegionOf(muscle, name);
    if (region) return { key: regionKey(muscle, region), label: region, region, band: regionBand(muscle, level) };
    return { key: muscle, label: muscle, region: null, band: targets[muscle] || { min: 1, max: 1, target: 1 } };
  };
  const round = n => Math.round((n || 0) * 10) / 10;

  exercises.forEach((ex, exIdx) => {
    const muscles = getMuscleGroupsForExercise(ex?.name);
    if (muscles.length === 0) return;
    const track = trackFor(ex.name, muscles[0]);
    const base = { muscle: track.label, region: track.region, target: track.band.min };
    (ex?.sets || []).forEach((set, setIdx) => {
      if (isWarmupSet(set)) return;
      // Not ticked yet: a plain grey ring, so every row of the exercise has one.
      if (!set.isCompleted) {
        out[`${exIdx}-${setIdx}`] = { ...base, state: 'idle', fraction: 0, sets: round(counts[track.key]), color: NOT_TRAINED };
        return;
      }
      const row = {
        exercise_name: ex.name,
        weight_kg: parseFloat(set.weight) || 0,
        reps: parseInt(set.reps, 10) || 0,
        set_type: set.setType || 'normal',
      };
      if (!isCountableSet(row)) {
        out[`${exIdx}-${setIdx}`] = { ...base, state: 'none', fraction: 0, sets: round(counts[track.key]), color: NOT_TRAINED };
        return;
      }
      muscles.forEach(m => {
        const w = getMuscleWeight(ex.name, m);
        counts[m] = (counts[m] || 0) + w;
        const region = ringRegionOf(m, ex.name);
        if (region) { const k = regionKey(m, region); counts[k] += w; }
      });
      const sets = round(counts[track.key]);
      out[`${exIdx}-${setIdx}`] = {
        ...base,
        state: sets >= track.band.min ? 'done' : 'progress',
        fraction: Math.min(1, sets / track.band.min),
        sets,
        // Same colour as the Muscle Balance card's status for this many sets.
        color: STATUS_COLORS[classifyStatus(sets, track.band).key] || NOT_TRAINED,
      };
    });
  });
  return out;
}
