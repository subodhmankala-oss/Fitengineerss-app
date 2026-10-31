// The live coach on the client logger's card (LiveCoachCard): one plain
// sentence after every ticked set about what the body is doing right now,
// plus three small numbers for the exercise just trained. Pure functions
// over the logger's exercise list and the client's saved workout_logs rows.
//
// Which sentence wins, highest first:
//   tired     reps dropped hard against the first set of the exercise
//   recovery  first set of an exercise whose muscle isn't recovered yet
//   best      the set beats the same set last time (PREV)
//   more      same weight × reps done 3+ sessions running: go heavier
//   strength  estimated max is up on the last 30 days
//   week      fallback: the muscle's sets this week against its target
// recovery / more / strength are said once per exercise per workout, so the
// card doesn't repeat itself set after set.

import { getMuscleGroupsForExercise } from './muscleGroups.js';
import { getMuscleRecovery, getWeeklyMuscleStats, MUSCLE_TARGETS } from './muscleAnalytics.js';
import { liveMuscleSummary, beatsLastTime, tickedSetRows, weekBoundsFor } from './liveSessionStats.js';
import { sameExerciseEntry } from './exerciseName.js';
import { shiftLocalDateString } from './dateUtils.js';
import { isCardioExercise, isTimedExercise, isBodyweightExercise } from '../data/exerciseLibrary.js';

const isWarmupSet = (set) => !!set.isWarmup || set.setType === 'warmup';
const num = (v) => parseFloat(v) || 0;
const int = (v) => parseInt(v, 10) || 0;

// Weight × reps exercises — the only ones these insights make sense for.
const isLiftExercise = (name) => !isCardioExercise(name) && !isTimedExercise(name);

// "Your quads are", "your chest is".
const PLURAL = new Set(['Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Glutes', 'Quads', 'Hamstrings', 'Calves']);
const isAre = (muscle) => (PLURAL.has(muscle) ? 'are' : 'is');

// One decimal for half sets (9.5), whole numbers otherwise.
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

/** Estimated one-rep max (Epley). 0 when it can't be judged (no load, or a high-rep set). */
export function estimatedMax(weight, reps) {
  const w = num(weight), r = int(reps);
  if (w <= 0 || r <= 0 || r > 15) return 0;
  return w * (1 + r / 30);
}

// Smallest sensible jump for this load: 2.5 kg plates, 1 kg on light dumbbells.
const weightStep = (w) => (w >= 10 ? 2.5 : 1);
const roundTo = (v, step) => Math.round(v / step) * step;

// Saved working rows of this exercise from before the session's date.
function historyRows(savedLogs, exercise, logDate) {
  return (savedLogs || []).filter(r =>
    r.log_date < logDate && r.set_type !== 'warmup' &&
    sameExerciseEntry({ name: r.exercise_name, exerciseId: r.exercise_id }, exercise));
}

// Today's ticked working sets of one exercise, in the order they were ticked.
const doneSets = (exercise) => (exercise.sets || [])
  .filter(s => s.isCompleted && !isWarmupSet(s))
  .sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));

function tiredInsight(exercise, set, muscle) {
  if (!isLiftExercise(exercise.name)) return null;
  const sets = doneSets(exercise);
  if (sets.length < 2) return null;
  const first = sets[0];
  const rFirst = int(first.reps), rNow = int(set.reps);
  if (rFirst < 4 || rNow > Math.floor(rFirst * 0.75) || num(set.weight) > num(first.weight)) return null;
  const w = num(set.weight);
  const lighter = w > 0 ? roundTo(w * 0.9, weightStep(w)) : 0;
  const then = lighter > 0 && lighter < w
    ? `or drop to ${fmt(lighter)} kg for one more set.`
    : 'or rest a little longer before one more set.';
  return {
    kind: 'tired',
    muscle,
    text: `Reps fell from ${rFirst} to ${rNow}. Your ${muscle.toLowerCase()} ${isAre(muscle)} tired. Stop ${exercise.name} here, ${then}`,
  };
}

/** How rested `muscle` was going into this session (getMuscleRecovery over saved rows before its date), or null if never trained. */
export function recoveryBefore(savedLogs, muscle, logDate, now = new Date()) {
  return getMuscleRecovery((savedLogs || []).filter(r => r.log_date < logDate), muscle, now);
}

function recoveryInsight(savedLogs, muscle, logDate, now) {
  const rec = recoveryBefore(savedLogs, muscle, logDate, now);
  if (!rec || rec.percent >= 80) return null;
  const when = rec.hoursSince < 36 ? 'yesterday' : `${Math.round(rec.hoursSince / 24)} days ago`;
  return {
    kind: 'recovery',
    muscle,
    text: `You trained ${muscle.toLowerCase()} ${when}. ${PLURAL.has(muscle) ? 'They are' : 'It is'} about ${rec.percent}% recovered, so don't go to your limit today.`,
  };
}

// Sessions in a row (today included) that did exactly this weight for at
// least these reps — "you've done 40 kg × 10 three times now".
function sameLoadStreak(history, w, r) {
  const byDate = {};
  history.forEach(row => { (byDate[row.log_date] = byDate[row.log_date] || []).push(row); });
  let streak = 1;
  for (const date of Object.keys(byDate).sort().reverse()) {
    const rows = byDate[date];
    const top = Math.max(...rows.map(x => num(x.weight_kg)));
    const hit = rows.some(x => Math.abs(num(x.weight_kg) - w) < 0.01 && int(x.reps) >= r);
    if (Math.abs(top - w) < 0.01 && hit) streak += 1;
    else break;
  }
  return streak;
}

function moreInsight(exercise, set, history, muscle) {
  if (!isLiftExercise(exercise.name)) return null;
  const w = num(set.weight), r = int(set.reps);
  if (r <= 0) return null;
  const bodyweight = w <= 0;
  if (bodyweight && !isBodyweightExercise(exercise.name)) return null;
  const streak = sameLoadStreak(history, w, r);
  if (streak < 3) return null;
  return {
    kind: 'more',
    muscle,
    text: bodyweight
      ? `You've done ${r} reps on ${exercise.name} ${streak} times now. Try ${r + 2} reps on your next set.`
      : `You've done ${fmt(w)} kg × ${r} on ${exercise.name} ${streak} times now. Try ${fmt(w + weightStep(w))} kg on your next set.`,
  };
}

/** % change of today's best estimated max on this exercise against the best in the 30 days before; null without both. */
export function strengthChange(exercise, history, logDate) {
  const today = Math.max(0, ...doneSets(exercise).map(s => estimatedMax(s.weight, s.reps)));
  const monthAgo = shiftLocalDateString(logDate, -30);
  const before = Math.max(0, ...history.filter(r => r.log_date >= monthAgo).map(r => estimatedMax(r.weight_kg, r.reps)));
  if (!today || !before) return null;
  return Math.round(((today - before) / before) * 100);
}

/** The fallback sentence: the exercise's main muscle's sets this week against its target. */
export function weekInsight(savedLogs, exercises, logDate, exercise) {
  const focus = liveMuscleSummary(savedLogs, exercises, logDate).focus;
  const muscle = getMuscleGroupsForExercise(exercise.name)[0];
  if (!focus || !muscle) return { kind: 'week', muscle: null, text: `${exercise.name} logged. Keep going.` };
  return {
    kind: 'week',
    muscle: focus.muscle,
    text: focus.left > 0
      ? `${focus.muscle}: ${fmt(focus.sets)} of ${focus.target} sets this week. ${focus.left} more to go.`
      : `${focus.muscle} ${isAre(focus.muscle)} done for this week. Great job.`,
  };
}

export const START_INSIGHT = { kind: 'start', muscle: null, text: "Tick your first set. I'll tell you how your body is doing as you go." };

/**
 * The sentence for a set that was just ticked.
 * @param {object} p
 * @param {object} p.exercise - the logger entry the set belongs to
 * @param {object} p.set - the ticked set
 * @param {Array} p.exercises - the whole logger list (for the week count)
 * @param {string} p.logDate
 * @param {Array} p.savedLogs - this client's saved workout_logs rows
 * @param {object|null} p.prevSet - last time's same set (PREV), for "best"
 * @param {Set<string>} p.said - `${kind}:${exercise name}` already said this workout
 * @returns {{kind, muscle, text}}
 */
export function coachInsight({ exercise, set, exercises, logDate, savedLogs, prevSet = null, said = new Set(), now = new Date() }) {
  const muscle = getMuscleGroupsForExercise(exercise.name)[0] || null;
  const once = (kind) => !said.has(`${kind}:${exercise.name}`);
  const history = historyRows(savedLogs, exercise, logDate);
  const isFirstSet = doneSets(exercise).length === 1;

  if (muscle && !isWarmupSet(set)) {
    const tired = tiredInsight(exercise, set, muscle);
    if (tired) return tired;
    if (isFirstSet && once('recovery')) {
      const rec = recoveryInsight(savedLogs, muscle, logDate, now);
      if (rec) return rec;
    }
    if (beatsLastTime(exercise.name, set, prevSet)) {
      const w = num(set.weight);
      return { kind: 'best', muscle, text: `New best on ${exercise.name}: ${w > 0 ? `${fmt(w)} kg × ${int(set.reps)}` : `${int(set.reps)} reps`}. Better than last time.` };
    }
    if (once('more')) {
      const more = moreInsight(exercise, set, history, muscle);
      if (more) return more;
    }
    if (once('strength')) {
      const pct = strengthChange(exercise, history, logDate);
      if (pct != null && pct >= 1) return { kind: 'strength', muscle, text: `${exercise.name} strength is up ${pct}% on last month. Nice work.` };
    }
  }
  return weekInsight(savedLogs, exercises, logDate, exercise);
}

/**
 * The three small numbers for the exercise just trained: strength change vs
 * the last 30 days, the main muscle's sets this week, and how rested that
 * muscle was coming in.
 */
export function coachStats({ exercise, exercises, logDate, savedLogs, now = new Date() }) {
  const muscle = getMuscleGroupsForExercise(exercise.name)[0] || null;
  if (!muscle) return null;
  const history = historyRows(savedLogs, exercise, logDate);
  // Week count: saved sets plus everything ticked today, same as Muscle Balance.
  const [start, end] = weekBoundsFor(logDate);
  const stat = getWeeklyMuscleStats([...(savedLogs || []), ...tickedSetRows(exercises, logDate)], start, end, { includeUntrained: true })
    .find(s => s.muscle === muscle);
  const weekSets = stat ? stat.sets : 0;
  const rec = recoveryBefore(savedLogs, muscle, logDate, now);
  return {
    muscle,
    strengthPct: isLiftExercise(exercise.name) ? strengthChange(exercise, history, logDate) : null,
    weekSets,
    weekTarget: MUSCLE_TARGETS[muscle].target,
    recoveredPct: rec ? rec.percent : 100,
  };
}
