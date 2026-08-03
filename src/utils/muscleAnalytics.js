// ─── WEEKLY MUSCLE ANALYTICS ENGINE ───
// Pure calculation functions for the "Weekly Muscle Analytics" screen. Reads
// only the existing workout_logs rows (via WorkoutProgressDashboard's already
// -fetched `logs` array) — no new API calls, no manual input.
//
// DATA HONESTY NOTE: workout_logs.log_date is a DATE column (no time-of-day),
// so it can't answer "how many hours ago". For the recovery calculation
// (Section 4/9, which needs hour precision) we use each row's `created_at`
// (a real TIMESTAMPTZ, set when the set was saved) as a stand-in for "when
// this muscle was trained". In the overwhelming common case — finish a set,
// mark it done, it saves — these are the same moment; the gap only matters
// for a client backdating an old session, which is rare and non-critical for
// a recovery *estimate*. Every other calculation here (weekly sets, volume,
// status, push/pull/legs/core split) uses log_date, which is exactly right
// for day-bucketed weekly volume.

import { MUSCLE_GROUPS, MUSCLE_TO_PPLC, LARGE_MUSCLES, getMuscleGroupsForExercise } from './muscleGroups';
import { getLocalDateString, parseLocalDateString, shiftLocalDateString } from './dateUtils';
import { isCardioExercise, isTimedExercise, isLoadedCarryExercise } from '../data/exerciseLibrary';

// ── Configurable targets (Smart Calculations: large 12–20, small 8–15) ──
// Exported so thresholds can be retuned later without touching the logic
// below. `target` is the single reference number shown as "X / Target Sets"
// and used for the completion % (midpoint of the optimal band).
export const MUSCLE_TARGETS = MUSCLE_GROUPS.reduce((acc, muscle) => {
  const large = LARGE_MUSCLES.has(muscle);
  const min = large ? 12 : 8;
  const max = large ? 20 : 15;
  acc[muscle] = { min, max, target: Math.round((min + max) / 2) };
  return acc;
}, {});

// A muscle with sets below `min * UNDERTRAINED_RATIO` is "Undertrained" (🟠)
// rather than just "Slightly Low" (🟡) — i.e. meaningfully short, not a
// near-miss. Configurable single knob for that split.
const UNDERTRAINED_RATIO = 0.7;

const STATUS = {
  NEGLECTED: { key: 'neglected', label: 'Neglected', emoji: '🔴', color: 'neglected' },
  UNDERTRAINED: { key: 'undertrained', label: 'Undertrained', emoji: '🟠', color: 'undertrained' },
  SLIGHTLY_LOW: { key: 'slightly_low', label: 'Slightly Low', emoji: '🟡', color: 'slightly-low' },
  OPTIMAL: { key: 'optimal', label: 'Optimal', emoji: '🟢', color: 'optimal' },
  HIGH_VOLUME: { key: 'high_volume', label: 'High Volume', emoji: '🔵', color: 'high-volume' },
};

function classifyStatus(sets, { min, max }) {
  if (sets === 0) return STATUS.NEGLECTED;
  if (sets > max) return STATUS.HIGH_VOLUME;
  if (sets >= min) return STATUS.OPTIMAL;
  if (sets >= min * UNDERTRAINED_RATIO) return STATUS.SLIGHTLY_LOW;
  return STATUS.UNDERTRAINED;
}

// Section 2's heat map uses its own 5-color language (Gray/Blue/Green/
// Orange/Red) rather than Section 1's 5 status labels — this maps one to the
// other so both sections stay driven by the exact same underlying
// classification (no second, divergent threshold set to maintain).
// Undertrained + Slightly Low both collapse to "Low" (blue); High Volume
// splits into Orange/Red by how far over target it is.
export function getHeatMapTier(muscleStat) {
  const { status, completionPercent } = muscleStat;
  if (status.key === 'neglected') return { key: 'not_trained', color: '#64748b', label: 'Not Trained' };
  if (status.key === 'undertrained' || status.key === 'slightly_low') return { key: 'low', color: '#3b82f6', label: 'Low' };
  if (status.key === 'optimal') return { key: 'optimal', color: '#10b981', label: 'Optimal' };
  if (status.key === 'high_volume') {
    return completionPercent > 150
      ? { key: 'very_high', color: '#ef4444', label: 'Very High' }
      : { key: 'high', color: '#f97316', label: 'High' };
  }
  return { key: 'not_trained', color: '#64748b', label: 'Not Trained' };
}

// Working sets only — warmups don't count toward training volume (matches
// how the logger itself treats them elsewhere in the app).
const isWorkingSet = (log) => log.set_type !== 'warmup';

/**
 * Tonnage (kg) contributed by a single workout_logs row.
 *
 * Returns 0 for every row where `weight_kg * reps` is NOT tonnage:
 *  - warmup sets (excluded from training volume everywhere else too)
 *  - cardio rows, which store distance_km + cardio_duration_seconds and write
 *    reps/weight as 0 (see saveWorkoutSession) — already 0, but explicit
 *  - timed holds (plank, wall sit), which reuse cardio_duration_seconds
 *  - loaded carries (Farmer Walk etc.), where the `reps` column holds METERS
 *    walked, not repetitions. Multiplying kg by metres produced a huge bogus
 *    "volume" number (a 40 kg x 40 m carry read as 1,600 kg lifted), which is
 *    what inflated the weekly Total Volume stat.
 */
export function getSetVolumeKg(log) {
  if (!isWorkingSet(log)) return 0;
  const name = log.exercise_name;
  if (isCardioExercise(name) || isTimedExercise(name) || isLoadedCarryExercise(name)) return 0;
  const weight = parseFloat(log.weight_kg) || 0;
  const reps = parseInt(log.reps, 10) || 0;
  return weight * reps;
}

// Whether a row counts toward "total sets" — working sets only, matching the
// per-muscle set counts so the headline stat can't disagree with the
// breakdown cards.
export function isCountableSet(log) {
  return isWorkingSet(log);
}

const inRange = (dateStr, startStr, endStr) => dateStr >= startStr && dateStr <= endStr;

/**
 * Aggregates weekly sets + volume per muscle group, with status + completion%.
 * @param {Array} logs - raw workout_logs rows (log_date, exercise_name, weight_kg, reps, set_type, created_at)
 * @param {string} weekStartStr - YYYY-MM-DD (inclusive)
 * @param {string} weekEndStr - YYYY-MM-DD (inclusive)
 * @returns {Array<{muscle, sets, volume, days, min, max, target, completionPercent, status}>}
 */
export function getWeeklyMuscleStats(logs, weekStartStr, weekEndStr) {
  const bySets = {};
  const byVolume = {};
  const byDays = {};
  MUSCLE_GROUPS.forEach(m => { bySets[m] = 0; byVolume[m] = 0; byDays[m] = new Set(); });

  logs.forEach(log => {
    if (!isWorkingSet(log)) return;
    if (!inRange(log.log_date, weekStartStr, weekEndStr)) return;
    const muscles = getMuscleGroupsForExercise(log.exercise_name);
    if (muscles.length === 0) return; // unrecognized exercise name — excluded, not guessed
    const volume = getSetVolumeKg(log);
    muscles.forEach(m => {
      bySets[m] += 1;
      byVolume[m] += volume;
      byDays[m].add(log.log_date);
    });
  });

  return MUSCLE_GROUPS.map(muscle => {
    const sets = bySets[muscle];
    const days = byDays[muscle].size;
    const volume = Math.round(byVolume[muscle]);
    const { min, max, target } = MUSCLE_TARGETS[muscle];
    const status = classifyStatus(sets, { min, max });
    const completionPercent = Math.round((sets / target) * 100);
    return { muscle, sets, volume, days, min, max, target, completionPercent, status };
  });
}

// Average completion% across all 11 muscles — used as an honest stand-in for
// "how balanced is this week vs. target", NOT a claim about actual muscle
// growth/hypertrophy (which this app has no data to measure — no strength
// tests, no body composition). Displayed as "Balance Trend", not "Growth".
export function getAverageCompletion(weeklyMuscleStats) {
  if (weeklyMuscleStats.length === 0) return 0;
  const sum = weeklyMuscleStats.reduce((acc, m) => acc + Math.min(150, m.completionPercent), 0);
  return Math.round(sum / weeklyMuscleStats.length);
}

/**
 * Push / Pull / Legs / Core volume split, by set count, as percentages.
 * Returns null categories as 0% if nothing was trained.
 */
export function getPPLCDistribution(weeklyMuscleStats) {
  const totals = { Push: 0, Pull: 0, Legs: 0, Core: 0 };
  weeklyMuscleStats.forEach(({ muscle, sets }) => {
    const cat = MUSCLE_TO_PPLC[muscle];
    if (cat) totals[cat] += sets;
  });
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  const percentages = {};
  Object.keys(totals).forEach(cat => {
    percentages[cat] = grandTotal > 0 ? Math.round((totals[cat] / grandTotal) * 100) : 0;
  });
  return { sets: totals, percentages, grandTotal };
}

// Recovery target hours: how long a muscle typically needs before it's fully
// "Recovered", scaled by how much volume was actually done in the last
// session that hit it (more sets → longer estimated recovery, within a
// bounded 0.6x–1.5x multiplier). RPE is not tracked yet (spec calls it out
// as future support) — `intensityMultiplier` param is a documented hook for
// wiring that in later without changing the call sites.
const BASE_RECOVERY_HOURS = { large: 48, small: 30 };

/**
 * Recovery status for a single muscle, based on the most recent working set
 * that trained it (via created_at — see file header for why).
 * @returns {null|{hoursSince, percent, bucket, estimatedReadyAt: Date}}
 */
export function getMuscleRecovery(logs, muscle, now = new Date(), intensityMultiplier = 1) {
  let lastTrainedAt = null;
  let lastSessionSets = 0;
  let lastSessionDate = null;

  logs.forEach(log => {
    if (!isWorkingSet(log)) return;
    const muscles = getMuscleGroupsForExercise(log.exercise_name);
    if (!muscles.includes(muscle)) return;
    const trainedAt = log.created_at ? new Date(log.created_at) : null;
    if (!trainedAt) return;
    if (!lastTrainedAt || trainedAt > lastTrainedAt) {
      lastTrainedAt = trainedAt;
      lastSessionDate = log.log_date;
    }
  });

  if (!lastTrainedAt) return null;

  // Count sets from that same session (same log_date) to scale recovery time.
  logs.forEach(log => {
    if (!isWorkingSet(log)) return;
    if (log.log_date !== lastSessionDate) return;
    if (getMuscleGroupsForExercise(log.exercise_name).includes(muscle)) lastSessionSets += 1;
  });

  const large = LARGE_MUSCLES.has(muscle);
  const base = large ? BASE_RECOVERY_HOURS.large : BASE_RECOVERY_HOURS.small;
  const volumeFactor = Math.min(1.5, Math.max(0.6, lastSessionSets / (large ? 12 : 8)));
  const requiredHours = base * volumeFactor * intensityMultiplier;

  const hoursSince = Math.max(0, (now.getTime() - lastTrainedAt.getTime()) / 3_600_000);
  const percent = Math.min(100, Math.round((hoursSince / requiredHours) * 100));

  // Bucket is derived from `percent` (not raw hoursSince) so the badge and
  // the percentage can never contradict each other — e.g. a muscle that only
  // took a light 4-set session recovers faster than a heavy 15-set one, so
  // "30 hours since" can legitimately mean 100% for one and 60% for another.
  // A fixed-hour bucket would show a mismatched badge (e.g. "Recovering"
  // next to "100%") for exactly that muscle.
  let bucket;
  if (percent >= 100) bucket = { key: 'recovered', label: 'Recovered', color: 'recovered' };
  else if (percent >= 66) bucket = { key: 'almost_ready', label: 'Almost Ready', color: 'almost-ready' };
  else if (percent >= 33) bucket = { key: 'recovering', label: 'Recovering', color: 'recovering' };
  else bucket = { key: 'recently_trained', label: 'Recently Trained', color: 'recently-trained' };

  const estimatedReadyAt = new Date(lastTrainedAt.getTime() + requiredHours * 3_600_000);

  return { hoursSince: Math.round(hoursSince), percent, bucket, estimatedReadyAt, lastTrainedAt };
}

// Static recommended-exercise lookup for Section 5 (Neglected Muscles). Kept
// short (3 per muscle) and intentionally simple — not a full program builder.
export const RECOMMENDED_EXERCISES = {
  Chest: ['Bench Press', 'Incline Dumbbell Press', 'Cable Fly'],
  Back: ['Barbell Row', 'Lat Pulldown', 'Seated Cable Row'],
  Shoulders: ['Shoulder Press (Dumbbell)', 'Lateral Raise', 'Face Pull'],
  Biceps: ['Barbell Curl', 'Incline Dumbbell Curl', 'Hammer Curl'],
  Triceps: ['Triceps Pushdown', 'Skullcrusher', 'Overhead Triceps Extension'],
  Forearms: ['Wrist Curl', 'Farmer Walk', 'Reverse Curl'],
  Core: ['Cable Crunch', 'Hanging Knee Raise', 'Plank'],
  Glutes: ['Hip Thrust', 'Glute Bridge', 'Cable Kickback'],
  Quads: ['Barbell Squat', 'Leg Press', 'Leg Extension'],
  Hamstrings: ['Romanian Deadlift', 'Leg Curl (Lying)', 'Good Morning'],
  Calves: ['Calf Raise (Standing)', 'Seated Calf Raise', 'Calf Raise (Machine)'],
};

/**
 * Days since a muscle was last trained, looking across ALL logs (not just
 * the current weekly window) — this is deliberately different from a
 * muscle's Section 1 "neglected" status, which only reflects zero sets
 * *within the selected 7-day window* and can misfire right after a week
 * boundary (e.g. trained 3 days ago, but that fell in last week's window).
 * Uses log_date (day precision) rather than created_at — a "10 days ago"
 * readout doesn't need hour precision, unlike the Recovery Dashboard.
 * @returns {null|{daysSince, lastDate}}
 */
export function getLastTrainedInfo(logs, muscle, now = new Date()) {
  let lastDate = null;
  logs.forEach(log => {
    if (!isWorkingSet(log)) return;
    if (!getMuscleGroupsForExercise(log.exercise_name).includes(muscle)) return;
    if (!lastDate || log.log_date > lastDate) lastDate = log.log_date;
  });
  if (!lastDate) return null;

  // Local-calendar-day diffing (not UTC-string parsing) — matches this app's
  // established convention (see dateUtils.js) for treating a YYYY-MM-DD
  // log_date as the client's own local day, not a UTC-shifted one.
  const daysSince = Math.round((parseLocalDateString(getLocalDateString(now)) - parseLocalDateString(lastDate)) / 86_400_000);
  return { daysSince, lastDate };
}

/**
 * Muscles with no training in `dayThreshold`+ days (Smart Calculations:
 * "Neglected = no training for 7+ days"), including muscles never trained
 * at all. Sorted worst-first (never-trained, then longest-idle).
 */
export function getNeglectedMuscles(logs, now = new Date(), dayThreshold = 7) {
  return MUSCLE_GROUPS
    .map(muscle => {
      const info = getLastTrainedInfo(logs, muscle, now);
      return { muscle, daysSince: info ? info.daysSince : null, lastDate: info ? info.lastDate : null, recommendedExercises: RECOMMENDED_EXERCISES[muscle] || [] };
    })
    .filter(m => m.daysSince === null || m.daysSince >= dayThreshold)
    .sort((a, b) => {
      if (a.daysSince === null && b.daysSince === null) return 0;
      if (a.daysSince === null) return -1;
      if (b.daysSince === null) return 1;
      return b.daysSince - a.daysSince;
    });
}

/**
 * Friendly "Estimated Ready" label: "Today 9:30 AM" / "Tomorrow 9:30 AM" /
 * a weekday+date for anything further out.
 */
export function formatEstimatedReady(date, now = new Date()) {
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dayDiff = Math.round((new Date(date.toDateString()) - new Date(now.toDateString())) / 86_400_000);
  if (dayDiff <= 0) return `Today ${timeStr}`;
  if (dayDiff === 1) return `Tomorrow ${timeStr}`;
  return `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${timeStr}`;
}

/**
 * Data-driven coaching insights. Every string is gated on a real condition
 * from this week's stats — nothing generic/random is ever included.
 * Capped to `limit` (spec asks for 3–5), most important first.
 */
export function generateWeeklyInsights(weeklyMuscleStats, pplc, limit = 5) {
  const insights = [];
  const trained = weeklyMuscleStats.filter(m => m.sets > 0);

  const neglected = weeklyMuscleStats.filter(m => m.status.key === 'neglected');
  neglected.forEach(m => insights.push(`⚠ ${m.muscle} received zero sets this week.`));

  const highVolume = weeklyMuscleStats.filter(m => m.status.key === 'high_volume')
    .sort((a, b) => b.completionPercent - a.completionPercent);
  highVolume.slice(0, 2).forEach(m => {
    const overBy = Math.round(((m.sets - m.target) / m.target) * 100);
    insights.push(`⚠ ${m.muscle} has exceeded your weekly target by ${overBy}%.`);
  });

  const undertrained = weeklyMuscleStats.filter(m => m.status.key === 'undertrained')
    .sort((a, b) => a.sets - b.sets);
  if (undertrained.length > 0) {
    const worst = undertrained[0];
    insights.push(`⚠ ${worst.muscle} received only ${worst.sets} set${worst.sets === 1 ? '' : 's'} — well below target.`);
  }

  // Lopsided pair comparisons (only the most extreme, and only if genuinely
  // lopsided — ≥50% higher one way).
  const bySets = Object.fromEntries(weeklyMuscleStats.map(m => [m.muscle, m.sets]));
  if (bySets.Hamstrings > 0 && bySets.Quads > 0) {
    const diffPct = Math.round(((bySets.Quads - bySets.Hamstrings) / bySets.Quads) * 100);
    if (diffPct >= 50) insights.push(`⚠ Hamstrings are lagging behind Quads by ${diffPct}%.`);
  } else if (bySets.Quads > 0 && bySets.Hamstrings === 0) {
    insights.push(`⚠ Hamstrings are lagging behind Quads by 100%.`);
  }

  if (pplc.percentages.Push > 0 && pplc.percentages.Pull > 0) {
    const ratio = pplc.sets.Push / pplc.sets.Pull;
    if (ratio >= 1.3) {
      const higherBy = Math.round((ratio - 1) * 100);
      insights.push(`Your Push volume is ${higherBy}% higher than Pull. Consider adding more rowing exercises.`);
    } else if (ratio <= 0.77) {
      const higherBy = Math.round((1 / ratio - 1) * 100);
      insights.push(`Your Pull volume is ${higherBy}% higher than Push. Consider adding more pressing exercises.`);
    } else if (trained.length >= 6) {
      insights.push('💪 Excellent Push/Pull balance.');
    }
  }

  if (neglected.length === 0 && undertrained.length === 0 && highVolume.length === 0 && trained.length >= 8) {
    insights.unshift('✅ Great consistency this week — every major muscle group was trained.');
  }

  return insights.slice(0, limit);
}

/**
 * Classifies a curr-vs-prev change into 'up' | 'down' | 'flat', with a small
 * noise threshold so a ±1-2% wobble doesn't read as a false trend. Shared by
 * compareWeeks() and any caller comparing its own curr/prev pair (e.g. the
 * Balance Trend row, which compares average completion% across two weeks).
 */
export function classifyTrend(curr, prev) {
  if (prev === 0 && curr === 0) return 'flat';
  if (prev === 0) return 'up';
  const deltaPct = ((curr - prev) / prev) * 100;
  if (Math.abs(deltaPct) < 3) return 'flat';
  return deltaPct > 0 ? 'up' : 'down';
}

const pctChange = (curr, prev) => (prev === 0 ? null : Math.round(((curr - prev) / prev) * 100));

/**
 * Compares this week's totals against the previous 7-day window. Returns
 * trend arrows ('up' | 'down' | 'flat') per metric.
 */
export function compareWeeks(logs, thisWeekStart, thisWeekEnd, prevWeekStart, prevWeekEnd) {
  const summarize = (startStr, endStr) => {
    let sets = 0, volume = 0;
    const days = new Set();
    logs.forEach(log => {
      if (!isWorkingSet(log)) return;
      if (!inRange(log.log_date, startStr, endStr)) return;
      sets += 1;
      volume += (parseFloat(log.weight_kg) || 0) * (parseInt(log.reps, 10) || 0);
      days.add(log.log_date);
    });
    return { sets, volume: Math.round(volume), workouts: days.size };
  };

  const thisWeek = summarize(thisWeekStart, thisWeekEnd);
  const prevWeek = summarize(prevWeekStart, prevWeekEnd);

  return {
    thisWeek,
    prevWeek,
    workouts: { ...thisWeek, trend: classifyTrend(thisWeek.workouts, prevWeek.workouts) },
    volume: { curr: thisWeek.volume, prev: prevWeek.volume, trend: classifyTrend(thisWeek.volume, prevWeek.volume), pctChange: pctChange(thisWeek.volume, prevWeek.volume) },
    sets: { curr: thisWeek.sets, prev: prevWeek.sets, trend: classifyTrend(thisWeek.sets, prevWeek.sets), pctChange: pctChange(thisWeek.sets, prevWeek.sets) },
  };
}

/**
 * Short, actionable recommendation strings. Data-gated like insights.
 */
export function getRecommendations(weeklyMuscleStats, limit = 5) {
  const recs = [];
  const undertrainedOrNeglected = weeklyMuscleStats
    .filter(m => m.status.key === 'undertrained' || m.status.key === 'neglected')
    .sort((a, b) => a.sets - b.sets);

  undertrainedOrNeglected.slice(0, 2).forEach(m => {
    const setsNeeded = Math.max(1, m.min - m.sets);
    recs.push(`Add ${setsNeeded} more ${m.muscle} set${setsNeeded === 1 ? '' : 's'} this week.`);
  });

  const highVolume = weeklyMuscleStats.filter(m => m.status.key === 'high_volume');
  highVolume.slice(0, 1).forEach(m => {
    recs.push(`Consider skipping ${m.muscle} for a day or two — you're well past your weekly target.`);
  });

  // Posterior chain (Back + Hamstrings) both meaningfully behind target —
  // a common, coach-worthy pattern worth calling out as a themed focus
  // rather than two separate single-muscle lines.
  const backStat = weeklyMuscleStats.find(m => m.muscle === 'Back');
  const hamStat = weeklyMuscleStats.find(m => m.muscle === 'Hamstrings');
  const isBehind = (m) => m && (m.status.key === 'undertrained' || m.status.key === 'neglected');
  if (isBehind(backStat) && isBehind(hamStat)) {
    recs.push('Focus on Posterior Chain — Back and Hamstrings are both behind target this week.');
  }

  // All of a muscle's volume crammed into a single session, and it's still
  // not at target — frequency (not just total sets) is the fix.
  const lowFrequency = weeklyMuscleStats
    .filter(m => m.sets > 0 && m.days === 1 && (m.status.key === 'undertrained' || m.status.key === 'slightly_low'))
    .sort((a, b) => a.completionPercent - b.completionPercent);
  if (lowFrequency.length > 0) {
    recs.push(`Increase ${lowFrequency[0].muscle} training frequency — all sets came from a single session this week.`);
  }

  const totalSets = weeklyMuscleStats.reduce((sum, m) => sum + m.sets, 0);
  if (totalSets > 130) recs.push('Schedule a rest day — total weekly volume is high.');

  return recs.slice(0, limit);
}

// ─── Section 9: Muscle Detail Screen ───

/**
 * Per-exercise breakdown of a muscle's volume within a date range — which
 * exercises actually made up its weekly sets, and how much each contributed.
 */
export function getExerciseBreakdownForMuscle(logs, muscle, startStr, endStr) {
  const byExercise = {};
  logs.forEach(log => {
    if (!isWorkingSet(log)) return;
    if (!inRange(log.log_date, startStr, endStr)) return;
    if (!getMuscleGroupsForExercise(log.exercise_name).includes(muscle)) return;
    const name = log.exercise_name;
    if (!byExercise[name]) byExercise[name] = { exerciseName: name, sets: 0, volume: 0, maxWeight: 0 };
    const weight = parseFloat(log.weight_kg) || 0;
    const reps = parseInt(log.reps, 10) || 0;
    byExercise[name].sets += 1;
    byExercise[name].volume += weight * reps;
    if (weight > byExercise[name].maxWeight) byExercise[name].maxWeight = weight;
  });

  const list = Object.values(byExercise);
  const totalSets = list.reduce((sum, e) => sum + e.sets, 0);
  return list
    .map(e => ({ ...e, volume: Math.round(e.volume), contributionPercent: totalSets > 0 ? Math.round((e.sets / totalSets) * 100) : 0 }))
    .sort((a, b) => b.sets - a.sets);
}

// Epley formula — a standard, simple estimated-1RM approximation (not a claim
// of a tested true 1-rep max). Used to rank "best lift" across different
// weight/rep combinations on a comparable basis.
const estimated1RM = (weight, reps) => weight * (1 + reps / 30);

/**
 * The single best working set for a muscle (by estimated 1RM), optionally
 * scoped to a date range. With no range, searches all history — used for
 * "Best Lift". With a range, used internally by the growth score to compare
 * week-over-week strength signal.
 */
export function getBestLiftForMuscle(logs, muscle, startStr = null, endStr = null) {
  let best = null;
  logs.forEach(log => {
    if (!isWorkingSet(log)) return;
    if (startStr && endStr && !inRange(log.log_date, startStr, endStr)) return;
    if (!getMuscleGroupsForExercise(log.exercise_name).includes(muscle)) return;
    const weight = parseFloat(log.weight_kg) || 0;
    const reps = parseInt(log.reps, 10) || 0;
    if (weight <= 0 || reps <= 0) return;
    const e1rm = estimated1RM(weight, reps);
    if (!best || e1rm > best.estimated1RM) {
      best = { exerciseName: log.exercise_name, weight, reps, date: log.log_date, estimated1RM: Math.round(e1rm * 10) / 10 };
    }
  });
  return best;
}

/**
 * Top-N personal records for a muscle — the best set per distinct exercise
 * (by estimated 1RM), across all history, ranked highest first.
 */
export function getPersonalRecordsForMuscle(logs, muscle, topN = 3) {
  const bestByExercise = {};
  logs.forEach(log => {
    if (!isWorkingSet(log)) return;
    if (!getMuscleGroupsForExercise(log.exercise_name).includes(muscle)) return;
    const weight = parseFloat(log.weight_kg) || 0;
    const reps = parseInt(log.reps, 10) || 0;
    if (weight <= 0 || reps <= 0) return;
    const e1rm = estimated1RM(weight, reps);
    const existing = bestByExercise[log.exercise_name];
    if (!existing || e1rm > existing.estimated1RM) {
      bestByExercise[log.exercise_name] = { exerciseName: log.exercise_name, weight, reps, date: log.log_date, estimated1RM: Math.round(e1rm * 10) / 10 };
    }
  });
  return Object.values(bestByExercise).sort((a, b) => b.estimated1RM - a.estimated1RM).slice(0, topN);
}

/**
 * Weekly set-count trend for a muscle over the last `weeksBack` weeks
 * (oldest first) — feeds the detail screen's trend sparkline.
 */
export function getWeeklySetsTrendForMuscle(logs, muscle, weeksBack = 6, now = new Date()) {
  const todayStr = getLocalDateString(now);
  const weeks = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const end = shiftLocalDateString(todayStr, -7 * i);
    const start = shiftLocalDateString(end, -6);
    let sets = 0;
    logs.forEach(log => {
      if (!isWorkingSet(log)) return;
      if (!inRange(log.log_date, start, end)) return;
      if (getMuscleGroupsForExercise(log.exercise_name).includes(muscle)) sets += 1;
    });
    weeks.push({ weekStart: start, weekEnd: end, sets });
  }
  return weeks;
}

/**
 * "Estimated Growth Score" (0-100) — DELIBERATELY NOT a claim of measured
 * muscle growth/hypertrophy (this app has no strength-test, body-composition,
 * or imaging data to back that). It's an honest composite of three real
 * signals: how close this week's volume is to target, how many distinct days
 * this week actually trained the muscle (frequency), and whether this week's
 * best lift (est. 1RM) improved on last week's. The `breakdown` is returned
 * alongside the score so the UI can show what it's actually built from,
 * rather than presenting a bare number as pseudo-scientific fact.
 */
export function getMuscleGrowthScore(logs, muscle, now = new Date()) {
  const todayStr = getLocalDateString(now);
  const weekEnd = todayStr;
  const weekStart = shiftLocalDateString(todayStr, -6);
  const prevWeekEnd = shiftLocalDateString(weekStart, -1);
  const prevWeekStart = shiftLocalDateString(prevWeekEnd, -6);

  const thisWeekStats = getWeeklyMuscleStats(logs, weekStart, weekEnd).find(m => m.muscle === muscle);
  const volumeScore = thisWeekStats ? Math.min(100, thisWeekStats.completionPercent) : 0;
  const consistencyScore = thisWeekStats ? Math.min(100, Math.round((thisWeekStats.days / 3) * 100)) : 0;

  const thisWeekBest = getBestLiftForMuscle(logs, muscle, weekStart, weekEnd);
  const prevWeekBest = getBestLiftForMuscle(logs, muscle, prevWeekStart, prevWeekEnd);
  let overloadScore = null;
  if (thisWeekBest && prevWeekBest) {
    if (thisWeekBest.estimated1RM > prevWeekBest.estimated1RM * 1.01) overloadScore = 100;
    else if (thisWeekBest.estimated1RM >= prevWeekBest.estimated1RM * 0.99) overloadScore = 60;
    else overloadScore = 30;
  }

  const parts = [volumeScore, consistencyScore, ...(overloadScore != null ? [overloadScore] : [])];
  const score = parts.length > 0 ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0;

  return { score, breakdown: { volumeScore, consistencyScore, overloadScore } };
}

export { STATUS as MUSCLE_STATUS };
