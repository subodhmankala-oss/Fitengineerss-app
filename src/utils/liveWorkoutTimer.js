// Pure calculation helpers for the coach's Live Log session timer + calorie
// estimate. No backend, no polling — this is local React state (see
// TrainerDashboard.jsx's live-session-logger states), so every value here is
// always recomputed fresh from timestamps rather than incremented, the same
// non-drifting approach a server-side timer would use, just running on the
// coach's single device since there's no multi-viewer requirement here.

// Work calories: each completed set contributes reps x weight(kg) x this rate.
// Rest calories: time between completions (session start -> first set,
// then set -> set) contributes at this rate, representing light activity
// between sets rather than a full stop.
export const WORK_KCAL_PER_KG_REP = 0.10;
export const REST_KCAL_PER_SECOND = 0.05; // ~3 kcal/min of rest

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
}

// elapsed = (now - startedAt) - sum(pause durations)
export function computeElapsedSeconds(startedAt, pauseIntervals = [], now = Date.now()) {
  if (!startedAt) return 0;
  const total = Math.floor((now - startedAt) / 1000);
  const paused = pauseIntervals.reduce((sum, p) => {
    const end = p.resumedAt || now;
    return sum + Math.floor((end - p.pausedAt) / 1000);
  }, 0);
  return Math.max(0, total - paused);
}

// Seconds between two timestamps, with any paused time in between excluded —
// so pausing the session is never counted as "resting between sets".
function secondsBetweenExcludingPauses(from, to, pauseIntervals) {
  if (to <= from) return 0;
  let pausedOverlap = 0;
  for (const p of pauseIntervals) {
    const pEnd = p.resumedAt || to;
    const overlapStart = Math.max(from, p.pausedAt);
    const overlapEnd = Math.min(to, pEnd);
    if (overlapEnd > overlapStart) pausedOverlap += overlapEnd - overlapStart;
  }
  return Math.max(0, Math.floor((to - from - pausedOverlap) / 1000));
}

// Sums work calories (reps x weight) for every completed set, plus rest
// calories for the gaps between consecutive completions (anchored to session
// start for the first one). Sets not yet marked done contribute nothing.
export function computeLiveCalories(exercises, sessionStartedAt, pauseIntervals = []) {
  const completions = [];
  let workKcal = 0;

  exercises.forEach((ex) => {
    ex.sets.forEach((set) => {
      if (!set.isCompleted || !set.completedAt) return;
      const reps = parseFloat(set.reps) || 0;
      const weight = parseFloat(set.weight) || 0;
      workKcal += reps * weight * WORK_KCAL_PER_KG_REP;
      completions.push(set.completedAt);
    });
  });

  if (completions.length === 0) {
    return { totalKcal: 0, workKcal: 0, restKcal: 0 };
  }

  completions.sort((a, b) => a - b);

  let restSeconds = 0;
  let cursor = sessionStartedAt || completions[0];
  for (const t of completions) {
    restSeconds += secondsBetweenExcludingPauses(cursor, t, pauseIntervals);
    cursor = t;
  }

  const restKcal = restSeconds * REST_KCAL_PER_SECOND;
  return {
    totalKcal: Math.round((workKcal + restKcal) * 10) / 10,
    workKcal: Math.round(workKcal * 10) / 10,
    restKcal: Math.round(restKcal * 10) / 10,
  };
}

// Same work + rest formula as computeLiveCalories, but for flows that only have
// a single total-duration stopwatch and no per-set completion timestamps (the
// client's own "Log Sets" workout). Rest calories are derived from the whole
// workout duration rather than the gaps between individual set completions —
// which is equivalent, since in computeLiveCalories the summed inter-set gaps
// span exactly session-start → last-set anyway. Every set passed is counted as
// work (callers pass only the completed/kept sets).
export function computeCaloriesFromDuration(exercises, durationSeconds) {
  let workKcal = 0;
  exercises.forEach((ex) => {
    ex.sets.forEach((set) => {
      const reps = parseFloat(set.reps) || 0;
      const weight = parseFloat(set.weight) || 0;
      workKcal += reps * weight * WORK_KCAL_PER_KG_REP;
    });
  });
  const restKcal = Math.max(0, durationSeconds || 0) * REST_KCAL_PER_SECOND;
  return {
    totalKcal: Math.round((workKcal + restKcal) * 10) / 10,
    workKcal: Math.round(workKcal * 10) / 10,
    restKcal: Math.round(restKcal * 10) / 10,
  };
}
