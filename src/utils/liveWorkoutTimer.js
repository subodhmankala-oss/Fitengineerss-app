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
export const DEFAULT_BODY_WEIGHT_KG = 70;

// MET for a static core hold (plank, side plank, wall sit) — Compendium of
// Physical Activities lists isometric abdominal/calisthenic holds around
// 3.5-4.0 MET; a single flat value here matches the app's existing approach
// of fixed MET brackets rather than per-exercise tuning (see cardioMET).
const TIMED_HOLD_MET = 3.8;

// MET (Metabolic Equivalent of Task) by exercise + pace, from the Compendium
// of Physical Activities. A flat kcal/km rate was tried first and badly
// overestimated cycling in particular (10km in 20min ~ 600kcal vs a
// realistic ~250-300kcal for that pace) — km alone doesn't capture effort;
// the same 10km is an easy jog or a hard sprint depending on how long it
// took, and cycling covers far more ground per unit of effort than running.
// Speed (derived from distance/time) picks the right intensity bracket
// instead.
function cardioMET(exerciseName, speedKmh) {
  const n = (exerciseName || '').toLowerCase();

  if (/cycl|bik/.test(n)) {
    if (speedKmh < 16) return 4.0;   // leisure
    if (speedKmh < 19) return 6.8;   // light effort
    if (speedKmh < 22.5) return 8.0; // moderate
    if (speedKmh < 25.7) return 10.0; // vigorous
    if (speedKmh < 30.6) return 12.0; // racing pace
    return 15.8; // >30.6 km/h, competitive
  }
  if (/cross trainer|elliptical/.test(n)) return 5.0;
  if (/incline walk/.test(n)) return 6.0;
  if (/\bwalk/.test(n)) {
    if (speedKmh < 4.8) return 2.8;
    if (speedKmh < 6.4) return 3.5;
    return 5.0;
  }
  // Running / jogging (and any other custom cardio exercise) — pace brackets.
  if (speedKmh < 8.0) return 6.0;
  if (speedKmh < 9.7) return 8.3;
  if (speedKmh < 10.8) return 9.8;
  if (speedKmh < 11.9) return 10.5;
  if (speedKmh < 12.9) return 11.0;
  if (speedKmh < 13.9) return 11.8;
  if (speedKmh < 16.1) return 12.8;
  return 14.5; // faster than 16.1 km/h
}

// Standard MET calorie formula: kcal = MET x 3.5 x weightKg / 200 x minutes.
// Needs actual elapsed time (not just distance) since the same distance at
// different paces burns very different amounts — see cardioMET above.
function cardioKcal(exerciseName, distanceKm, durationSeconds, bodyWeightKg) {
  const km = parseFloat(distanceKm) || 0;
  const minutes = (durationSeconds || 0) / 60;
  if (km <= 0 || minutes <= 0) return 0;
  const speedKmh = km / (minutes / 60);
  const met = cardioMET(exerciseName, speedKmh);
  return (met * 3.5 * bodyWeightKg / 200) * minutes;
}

// Same MET formula as cardioKcal, but for a static hold (no distance/pace to
// derive intensity from) — duration alone drives the estimate.
function timedHoldKcal(durationSeconds, bodyWeightKg) {
  const minutes = (durationSeconds || 0) / 60;
  if (minutes <= 0) return 0;
  return (TIMED_HOLD_MET * 3.5 * bodyWeightKg / 200) * minutes;
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
}

// Cardio sets store their duration as a free-typed "mm:ss" string (matches
// what's shown as the field's placeholder). Accepts "mm:ss" or a bare number
// of seconds; returns null (not 0) for empty/unparseable input so it's never
// mistaken for an actually-logged zero-second set.
export function parseTimeStringToSeconds(str) {
  const trimmed = String(str ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.includes(':')) {
    const [m, s] = trimmed.split(':').map((v) => parseInt(v, 10) || 0);
    return m * 60 + s;
  }
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

// Inverse of parseTimeStringToSeconds — used to redisplay a saved cardio
// duration back into the "mm:ss" field.
export function formatSecondsToTimeString(totalSeconds) {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return '';
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Live "mm:ss" mask for the TIME field's onChange — every keystroke shifts
// digits in from the right, like a stopwatch entry, so typing "3" then "3"
// reads "00:03" then "00:33" instead of the raw digits the field would
// otherwise show. Backspacing down to zero digits clears back to the
// placeholder instead of getting stuck at "00:00".
export function maskDigitsToTimeString(rawValue) {
  const digits = String(rawValue ?? '').replace(/\D/g, '').slice(-4);
  if (!digits) return '';
  const padded = digits.padStart(4, '0');
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
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

// Sums work calories (reps x weight, MET-based for cardio, or MET-based on
// hold duration for timed sets like plank) for every completed set, plus
// rest calories for the gaps between consecutive completions (anchored to
// session start for the first one). Sets not yet marked done contribute
// nothing. bodyWeightKg only affects cardio/timed sets (the strength-set
// formula doesn't use it) — defaults to an average adult when the caller
// doesn't have the client's actual weight on hand.
export function computeLiveCalories(exercises, sessionStartedAt, pauseIntervals = [], bodyWeightKg = DEFAULT_BODY_WEIGHT_KG) {
  const completions = [];
  let workKcal = 0;

  exercises.forEach((ex) => {
    ex.sets.forEach((set) => {
      if (!set.isCompleted || !set.completedAt) return;
      if (set.distanceKm !== undefined) {
        workKcal += cardioKcal(ex.name, set.distanceKm, parseTimeStringToSeconds(set.time), bodyWeightKg);
      } else if (set.time !== undefined) {
        // Timed hold (plank etc.) — no reps/weight, duration-driven instead.
        workKcal += timedHoldKcal(parseTimeStringToSeconds(set.time), bodyWeightKg);
      } else {
        const reps = parseFloat(set.reps) || 0;
        const weight = parseFloat(set.weight) || 0;
        workKcal += reps * weight * WORK_KCAL_PER_KG_REP;
      }
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
