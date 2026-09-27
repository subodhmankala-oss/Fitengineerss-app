import { getLocalDateString } from './dateUtils';

// Builds the "10-minute comeback session" offered to a client with no coach
// who's been away a few days (see ComebackCard). Nobody authors these: the
// session is cut down from the client's own last workout, so the exercises
// are familiar and WorkoutTracker's handleStartFromTemplate pre-fills each
// set's kg from PREV. Only a client with nothing usable in their history
// falls back to the Workout Library's Home Beginner program (no equipment
// needed, so it works wherever they are).

// Days since the last logged workout before Home swaps the regular guidance
// banner for the comeback card. Matches the 3-day threshold api/push.js uses
// for the client's own "we miss you" push.
export const COMEBACK_THRESHOLD_DAYS = 3;

// ~10 minutes: 3 exercises x 2 sets, no warm-ups.
const COMEBACK_EXERCISES = 3;
const COMEBACK_SETS = 2;
export const COMEBACK_WORKOUT_NAME = '10-min Comeback';

// WorkoutTracker's default warm-ups (getDefaultWarmupExercises) are logged as
// ordinary rows, usually with no set_type, so they're matched by name too.
const WARMUP_NAMES = new Set(['arm circle', 'leg swing']);

const isStrengthRow = (log) =>
  !!log.exercise_name &&
  log.set_type !== 'warmup' &&
  !WARMUP_NAMES.has(log.exercise_name.trim().toLowerCase()) &&
  !(Number(log.distance_km) > 0) &&
  !(Number(log.cardio_duration_seconds) > 0);

const dayNumber = (dateStr) => {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

// Whole days between the most recent log_date and today, or null when the
// client has never logged a workout.
export function daysSinceLastWorkout(logs, today = getLocalDateString()) {
  let latest = null;
  for (const log of logs || []) {
    if (log.log_date && (!latest || log.log_date > latest)) latest = log.log_date;
  }
  if (!latest) return null;
  return Math.max(0, Math.round(dayNumber(today) - dayNumber(latest)));
}

// The first few strength exercises of the client's most recent workout day,
// in the order they did them. [] when there's nothing usable.
export function exercisesFromLastWorkout(logs) {
  const strength = (logs || []).filter(isStrengthRow);
  let latest = null;
  for (const log of strength) {
    if (log.log_date && (!latest || log.log_date > latest)) latest = log.log_date;
  }
  if (!latest) return [];

  const rows = strength
    .filter(l => l.log_date === latest)
    .sort((a, b) =>
      (a.session_row ?? Infinity) - (b.session_row ?? Infinity) ||
      String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
      (a.set_number ?? 0) - (b.set_number ?? 0)
    );

  const byName = new Map();
  for (const row of rows) {
    const key = row.exercise_name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, { name: row.exercise_name.trim(), reps: null });
    const entry = byName.get(key);
    if (entry.reps == null && Number(row.reps) > 0) entry.reps = String(row.reps);
  }

  return Array.from(byName.values())
    .slice(0, COMEBACK_EXERCISES)
    .map(ex => ({ name: ex.name, sets: COMEBACK_SETS, reps: ex.reps || '10' }));
}

// { name, exercises } in the shape handleStartFromTemplate takes, or null
// when there's neither usable history nor a fallback program.
export function buildComebackWorkout(logs, fallbackProgram = null) {
  let exercises = exercisesFromLastWorkout(logs);
  if (exercises.length < 2) {
    const fallback = Array.isArray(fallbackProgram?.exercises) ? fallbackProgram.exercises : [];
    exercises = fallback
      .slice(0, COMEBACK_EXERCISES)
      .map(ex => ({ name: ex.name, sets: COMEBACK_SETS, reps: ex.reps != null ? String(ex.reps) : '10' }));
  }
  if (exercises.length === 0) return null;
  return { name: COMEBACK_WORKOUT_NAME, exercises };
}
