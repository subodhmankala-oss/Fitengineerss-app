// Read-only workout links (/w/<token>) — see sql/workout_shares.sql.
// Shared by the browser and the server (api/_workoutShare.js).
import { getSetVolumeKg, isCountableSet, getWeeklyMuscleStats } from './muscleAnalytics.js';
import { isBodyweightExercise } from '../data/exerciseLibrary.js';

export { SHARE_TOKEN_RE, shareTokenFromPath } from './shareToken.js';

export const SHARE_FLAGS = ['showName', 'showMap', 'showWeights', 'showCalories'];
export const DEFAULT_SHARE_FLAGS = { showName: true, showMap: true, showWeights: true, showCalories: true };

// 128 random bits. Made in the browser so the link is known the instant
// WhatsApp opens (opening it after a network wait gets blocked on phones).
export function newShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const shareUrl = (token, origin) => `${origin}/w/${token}`;

export function shareMessage({ title, sets, durationSeconds, url }) {
  const mins = durationSeconds ? Math.max(1, Math.round(durationSeconds / 60)) : null;
  const facts = [`${sets} ${sets === 1 ? 'set' : 'sets'}`, mins ? `${mins} min` : null].filter(Boolean).join(', ');
  return `My ${title} workout on Fitengineers: ${facts}. Tap to see every set.\n${url}`;
}

// Which save a row belongs to (one INSERT shares one created_at on rows from
// before session_id).
export const sessionKeyOf = (row) => (row.session_id ? `sid:${row.session_id}` : `at:${row.created_at}`);

// A day's rows as separate workouts: [{ key, keys, title, rows }], in saved
// order. `key` names the workout (its link hangs on it). Rows from before
// session_id, and exercises added later as their own save, join the workout
// of the same name.
export function groupDayWorkouts(rows) {
  const isOwn = (key) => key.startsWith('sid:') && !key.startsWith('sid:missed-');
  const groups = [];
  const title = (r) => (r.plan_name || 'Workout').trim();
  const add = (key, r) => {
    const g = { key, keys: [key], title: title(r), rows: [r] };
    groups.push(g);
    return g;
  };
  const sorted = [...rows].sort((a, b) => Number(isOwn(sessionKeyOf(b))) - Number(isOwn(sessionKeyOf(a))));
  sorted.forEach(r => {
    const key = sessionKeyOf(r);
    const g = groups.find(x => x.keys.includes(key) && (isOwn(key) || x.title === title(r)))
      || (isOwn(key) ? null : groups.find(x => x.title === title(r)));
    if (!g) { add(key, r); return; }
    if (!g.keys.includes(key)) g.keys.push(key);
    g.rows.push(r);
  });
  return groups;
}

// What the Share sheet needs to know about one workout of a day.
export function shareableWorkout(group, logDate) {
  const seen = new Set();
  let durationSeconds = null;
  group.rows.forEach(r => {
    const key = sessionKeyOf(r);
    if (seen.has(key) || r.duration_seconds == null) return;
    seen.add(key);
    durationSeconds = (durationSeconds || 0) + Number(r.duration_seconds);
  });
  return {
    key: group.key,
    title: group.title,
    logDate,
    sets: group.rows.filter(isCountableSet).length,
    durationSeconds,
    muscles: musclesFromRows(group.rows, logDate),
  };
}

// "Rahul Sharma" → "Rahul". 'Warrior' is the app's no-name placeholder.
export function firstNameOf(fullName) {
  const first = String(fullName || '').trim().split(/\s+/)[0] || '';
  return !first || first.toLowerCase() === 'warrior' || first.includes('@') ? null : first.slice(0, 30);
}

// Server: saved rows → the only fields a visitor ever receives. Switched-off
// parts are left out here, not hidden in the page.
export function shapeSharedWorkout({ share, rows, fullName, previousBests = {} }) {
  const seen = new Set();
  let durationSeconds = null;
  let calories = null;
  rows.forEach(r => {
    const key = sessionKeyOf(r);
    if (seen.has(key)) return;
    seen.add(key);
    if (r.duration_seconds != null) durationSeconds = (durationSeconds || 0) + Number(r.duration_seconds);
    if (r.calories_burned != null) calories = (calories || 0) + Number(r.calories_burned);
  });

  const exercises = [];
  const byName = new Map();
  rows.forEach(r => {
    const kg = Number(r.weight_kg) || 0;
    let ex = byName.get(r.exercise_name);
    if (!ex) {
      ex = { name: r.exercise_name, sets: [] };
      byName.set(r.exercise_name, ex);
      exercises.push(ex);
    }
    ex.sets.push({
      reps: r.reps ?? 0,
      ...(share.show_weights ? { weightKg: kg } : { loaded: kg > 0 }),
      distanceKm: r.distance_km ?? null,
      seconds: r.cardio_duration_seconds ?? null,
      type: r.set_type || null,
    });
  });

  if (share.show_weights) {
    exercises.forEach(ex => {
      const prev = Number(previousBests[ex.name]) || 0;
      const top = Math.max(0, ...ex.sets.filter(s => s.type !== 'warmup' && s.reps > 0).map(s => s.weightKg));
      if (prev > 0 && top > prev) ex.newBest = true;
    });
  }

  return {
    title: rows.find(r => r.plan_name)?.plan_name || 'Workout',
    date: share.log_date,
    name: share.show_name ? firstNameOf(fullName) : null,
    durationSeconds,
    calories: share.show_calories && calories != null ? Math.round(calories) : null,
    showMap: !!share.show_map,
    showWeights: !!share.show_weights,
    bodySex: share.show_map ? share.body_sex || null : null,
    exercises,
  };
}

// A shared workout as workout_logs-style rows, so the app's own set-counting
// rules apply. Hidden weights stand in as 1 kg: enough to know the set was
// done, nothing about how heavy it was.
const toRows = (workout) => workout.exercises.flatMap(ex => ex.sets.map(s => ({
  log_date: workout.date,
  exercise_name: ex.name,
  reps: s.reps,
  weight_kg: workout.showWeights ? s.weightKg : (s.loaded ? 1 : 0),
  distance_km: s.distanceKm,
  cardio_duration_seconds: s.seconds,
  set_type: s.type,
})));

export function sharedWorkoutTotals(workout) {
  const rows = toRows(workout);
  return {
    sets: rows.filter(isCountableSet).length,
    volume: workout.showWeights ? Math.round(rows.reduce((sum, r) => sum + getSetVolumeKg(r), 0)) : null,
  };
}

// Muscle map colours for one workout: what it was about / what it also hit.
export const MAIN_MUSCLE_COLOR = '#10b981';
export const HELPED_MUSCLE_COLOR = '#3b82f6';

// Muscles one workout trained, most sets first. `main` = the ones it was
// mostly about (at least 60% of the top muscle's sets).
export function musclesFromRows(rows, date) {
  const stats = getWeeklyMuscleStats(rows, date, date)
    .filter(s => s.totalSets > 0)
    .sort((a, b) => b.totalSets - a.totalSets);
  const top = stats[0]?.totalSets || 0;
  return stats.map(s => ({ muscle: s.muscle, sets: s.totalSets, main: s.totalSets >= top * 0.6 }));
}

export const sharedWorkoutMuscles = (workout) => musclesFromRows(toRows(workout), workout.date);

export const sharedWeightLabel = (name, kg) => (
  isBodyweightExercise(name) && !(Number(kg) > 0) ? 'BW' : `${Number(kg) || 0} kg`
);
