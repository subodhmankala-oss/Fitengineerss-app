import { getNeglectedMuscles } from './muscleAnalytics';
import { getMuscleGroupsForExercise } from './muscleGroups';
import { getWorkoutDayType } from './warmupBlocks';

// ─── Neglected-muscle finisher for Workout Library programs ───
// At most one extra exercise (2 sets) at the end of a library program, for
// the muscle the client has gone longest without training (7+ days, see
// getNeglectedMuscles) — but only one that fits the day: upper-body muscles
// on an upper day, leg muscles on a leg day, anything on a full-body day.
// Core / conditioning days already work the whole body, so they get none,
// and a muscle today's program already trains is skipped (today fixes it).
// Clients with fewer than MIN_SESSIONS logged sessions get none: there's
// not enough history yet to call anything "neglected".

const MIN_SESSIONS = 3;
const FINISHER_SETS = 2;

const UPPER = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Core'];
const LOWER = ['Glutes', 'Quads', 'Hamstrings', 'Calves', 'Core'];
const FITS_DAY = { upper: UPPER, lower: LOWER, full: [...UPPER, ...LOWER] };

// One or two picks per muscle; the first not already in the session wins.
// Home only lists equipment-free moves — a muscle with none there (Biceps,
// Forearms) simply gets no finisher at home.
export const FINISHERS = {
  gym: {
    Chest: [{ name: 'Cable Fly', reps: 12 }, { name: 'Pec Deck Fly', reps: 12 }],
    Back: [{ name: 'Lat Pulldown', reps: 12 }, { name: 'Seated Cable Row', reps: 12 }],
    Shoulders: [{ name: 'Lateral Raise', reps: 15 }, { name: 'Face Pull', reps: 15 }],
    Biceps: [{ name: 'Bicep Curl (Dumbbell)', reps: 12 }, { name: 'Hammer Curl', reps: 12 }],
    Triceps: [{ name: 'Triceps Pushdown', reps: 12 }, { name: 'Overhead Triceps Extension', reps: 12 }],
    Forearms: [{ name: 'Wrist Curl', reps: 15 }, { name: 'Reverse Curl', reps: 12 }],
    Core: [{ name: 'Hanging Knee Raise', reps: 12 }, { name: 'Cable Crunch', reps: 15 }],
    Glutes: [{ name: 'Hip Thrust', reps: 12 }, { name: 'Glute Bridge', reps: 15 }],
    Quads: [{ name: 'Leg Press', reps: 12 }, { name: 'Goblet Squat', reps: 12 }],
    Hamstrings: [{ name: 'Leg Curl (Lying)', reps: 12 }, { name: 'Seated Leg Curl', reps: 12 }],
    Calves: [{ name: 'Standing Calf Raise', reps: 15 }, { name: 'Seated Calf Raise', reps: 15 }],
  },
  home: {
    Chest: [{ name: 'Push Up', reps: 12 }, { name: 'Incline Push-up', reps: 12 }],
    Back: [{ name: 'Superman', reps: 12 }],
    Triceps: [{ name: 'Diamond Push-up', reps: 10 }, { name: 'Triceps Dip', reps: 12 }],
    Core: [{ name: 'Dead Bug', reps: 12 }, { name: 'Crunch', reps: 15 }],
    Glutes: [{ name: 'Glute Bridge', reps: 15 }, { name: 'Step-up', reps: 12 }],
    Quads: [{ name: 'Squat', reps: 15 }, { name: 'Lunge', reps: 12 }],
    Hamstrings: [{ name: 'Single Leg Deadlift', reps: 12 }, { name: 'Nordic Hamstring Curl', reps: 6 }],
    Calves: [{ name: 'Calf Raise', reps: 20 }, { name: 'Standing Calf Raise', reps: 20 }],
  },
};

// The client's logged sessions as workout_logs-shaped rows, which is what
// getNeglectedMuscles reads. Warm-up sets keep their tag, so a warm-up
// block never counts as having trained a muscle.
export function sessionsToLogRows(sessions, clientName) {
  const me = (clientName || '').toLowerCase();
  const rows = [];
  (sessions || []).forEach(s => {
    if (s.clientName && me && s.clientName.toLowerCase() !== me) return;
    const date = String(s.date || '').slice(0, 10);
    if (!date) return;
    (s.exercises || []).forEach(ex => (ex.sets || []).forEach(set => {
      rows.push({ exercise_name: ex.name, log_date: date, set_type: set.isWarmup || set.setType === 'warmup' ? 'warmup' : (set.setType || null) });
    }));
  });
  return rows;
}

// { name, sets, reps, finisherFor: { muscle, daysSince } } to append to the
// program, or null. `exercises` is the program as it will be logged (after
// this week's swaps); `takenNames` are any other names already in the
// session (the warm-up block). History is either the logger's `sessions`
// (+ clientName) or workout_logs rows as `logRows` (the Home screen's).
export function pickNeglectedFinisher({ programName, exercises, category, sessions, clientName, logRows, takenNames = [], now = new Date() }) {
  const rows = logRows || sessionsToLogRows(sessions, clientName);
  if (new Set(rows.map(r => r.log_date)).size < MIN_SESSIONS) return null;

  const dayType = getWorkoutDayType(programName, exercises);
  const fits = FITS_DAY[dayType];
  if (!fits) return null;

  const program = exercises || [];
  // Main movers only: a leg curl's half set of calves doesn't count as
  // training calves today.
  const trainedToday = new Set(program.map(ex => getMuscleGroupsForExercise(ex.name)[0]).filter(Boolean));
  const taken = new Set([...program.map(ex => ex.name), ...takenNames].map(n => n.toLowerCase()));
  const options = FINISHERS[category === 'home' ? 'home' : 'gym'];

  for (const { muscle, daysSince } of getNeglectedMuscles(rows, now)) {
    if (!fits.includes(muscle) || trainedToday.has(muscle)) continue;
    const pick = (options[muscle] || []).find(o => !taken.has(o.name.toLowerCase()));
    if (pick) return { name: pick.name, sets: FINISHER_SETS, reps: String(pick.reps), finisherFor: { muscle, daysSince } };
  }
  return null;
}
