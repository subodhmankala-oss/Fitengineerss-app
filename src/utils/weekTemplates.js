import { isWarmupExercise } from '../data/exerciseLibrary';
import { rankTemplatesByPerformance, buildRecentWorkoutPlans } from './liveWorkoutTimer';

// The three templates pinned at the top of the Log Sets "Saved Templates"
// list for every client — realistic gym Push / Pull / Legs anyone can do:
// compound lift first, then accessories, 3 working sets each, all machines
// or dumbbells except the bench. Names match the exercises library exactly
// so the Form Guide video and PREV link up. Weight is left blank on purpose:
// startPlan's withPrevValues pre-fills it from the client's last session.
const sets = (reps, n = 3) => Array.from({ length: n }, () => ({ reps: String(reps), weight: '' }));

export const CORE_PPL_TEMPLATES = [
  {
    id: 'core:push',
    planName: 'Push Day',
    createdBy: 'core',
    exercises: [
      { name: 'Bench Press (Barbell)', sets: sets(8) },
      { name: 'Incline Dumbbell Press', sets: sets(10) },
      { name: 'Shoulder Press (Dumbbell)', sets: sets(10) },
      { name: 'Lateral Raise (Dumbbell)', sets: sets(12) },
      { name: 'Triceps Pushdown', sets: sets(12) },
    ],
  },
  {
    id: 'core:pull',
    planName: 'Pull Day',
    createdBy: 'core',
    exercises: [
      { name: 'Lat Pull Down', sets: sets(10) },
      { name: 'Seated Cable Row', sets: sets(10) },
      { name: 'One Arm Row', sets: sets(10) },
      { name: 'Face Pull', sets: sets(15) },
      { name: 'Bicep Curl (Dumbbell)', sets: sets(12) },
    ],
  },
  {
    id: 'core:legs',
    planName: 'Leg Day',
    createdBy: 'core',
    exercises: [
      { name: 'Leg Press', sets: sets(10) },
      { name: 'Romanian Deadlift', sets: sets(10) },
      { name: 'Leg Extension', sets: sets(12) },
      { name: 'Leg Curl (Lying)', sets: sets(12) },
      { name: 'Standing Calf Raise', sets: sets(15) },
    ],
  },
];

// YYYY-MM-DD `days` before `dateStr` (local calendar, no timezone drift).
const shiftDate = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// The "This week" group: one ready-to-start entry per workout the client
// logged in the last 7 days (today included), nothing saved to the DB — each
// one drops off by itself once its last session is over a week old. Built
// from the most recent session with that name, then ordered best-performed
// first (rankTemplatesByPerformance over just this week's sessions); equal
// scores keep the most-recent-first order. Warm-up moves/sets are dropped
// because startPlan adds the default warm-up itself. Names already shown as
// a pinned or saved template (`excludeNames`) are skipped.
export function buildThisWeekPlans(sessions, todayStr, excludeNames = [], limit = 5) {
  const cutoff = shiftDate(todayStr, 6);
  const weekSessions = (sessions || [])
    .filter(s => s && s.date && s.date >= cutoff && s.date <= todayStr)
    .map(s => ({
      ...s,
      exercises: (s.exercises || [])
        .filter(ex => ex && !isWarmupExercise(ex.name))
        .map(ex => ({ ...ex, sets: (ex.sets || []).filter(set => set && !set.isWarmup && set.setType !== 'warmup') })),
    }));
  const recent = buildRecentWorkoutPlans(weekSessions, excludeNames, Infinity);
  return rankTemplatesByPerformance(recent, weekSessions, limit);
}
