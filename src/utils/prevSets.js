import { isCardioExercise, isTimedExercise, isBodyweightExercise } from '../data/exerciseLibrary';

// "What did this client do last time?" lookups for the live logger's PREV
// column and its pre-fill. Pure functions over the in-memory session list
// (the same list the Progress tab graphs), so they can run both at render
// time and from the async callback that delivers the DB history.

const byNewestFirst = (a, b) => new Date(b.date) - new Date(a.date);

const clientSessionsNewestFirst = (sessions, clientName) => (sessions || [])
  .filter(s => (s.clientName || '').toLowerCase() === (clientName || '').toLowerCase())
  .sort(byNewestFirst);

// The most recent logged set for this exercise at this set index, or null
// when the client has never logged it.
export function findPreviousLoggedSetIn(sessions, clientName, exName, setIdx) {
  const name = (exName || '').toLowerCase();
  for (const session of clientSessionsNewestFirst(sessions, clientName)) {
    const exercise = (session.exercises || []).find(e => (e.name || '').toLowerCase() === name);
    if (exercise && exercise.sets && exercise.sets[setIdx]) return exercise.sets[setIdx];
  }
  return null;
}

// Every set of this exercise from the most recent session that has it, or
// null when the client has never logged it.
export function findPreviousExerciseSetsIn(sessions, clientName, exName) {
  const name = (exName || '').toLowerCase();
  for (const session of clientSessionsNewestFirst(sessions, clientName)) {
    const exercise = (session.exercises || []).find(e => (e.name || '').toLowerCase() === name);
    if (exercise && exercise.sets && exercise.sets.length > 0) return exercise.sets;
  }
  return null;
}

// A plan's kg/BW box starts from PREV (see withPrevWeight in
// WorkoutTracker). Cardio and plain timed sets have no weight and are
// returned unchanged, as are sets the client has never logged.
export function applyPrevWeight(exName, set, prev) {
  if (isCardioExercise(exName)) return set;
  if (isTimedExercise(exName) && !isBodyweightExercise(exName)) return set;
  if (!prev || prev.weight == null || prev.weight === '') return set;
  const weight = String(Number(prev.weight) || 0);
  return {
    ...set,
    weight,
    ...(isBodyweightExercise(exName) ? { bodyweightMode: !(Number(weight) > 0) } : {})
  };
}

// The Workout Library's pre-fill (handleStartFromTemplate): reps and weight
// both come from PREV when there is one.
export function applyPrevRepsAndWeight(set, prev) {
  if (!prev) return set;
  return { ...set, reps: prev.reps || set.reps, weight: prev.weight || set.weight };
}

// Sets started before the client's history had loaded carry
// `prevPending: 'plan' | 'template'` (which pre-fill they missed). Once the
// history arrives, give each still-pending, not-yet-completed set the
// pre-fill it would have had, and drop the flag. Any edit to a set clears
// its flag first, so nothing the client typed is overwritten. Returns the
// same array when nothing was pending, so callers don't trigger a
// needless re-render/draft save.
export function fillPendingPrevSets(exercises, lookup) {
  let changed = false;
  const next = exercises.map(ex => {
    if (!ex.sets.some(s => s.prevPending)) return ex;
    changed = true;
    return {
      ...ex,
      sets: ex.sets.map((s, setIdx) => {
        if (!s.prevPending) return s;
        const { prevPending, ...rest } = s;
        if (rest.isCompleted) return rest;
        const prev = lookup(ex.name, setIdx);
        return prevPending === 'template'
          ? applyPrevRepsAndWeight(rest, prev)
          : applyPrevWeight(ex.name, rest, prev);
      })
    };
  });
  return changed ? next : exercises;
}

// Sets for an exercise added mid-session: a copy of what the client did
// last time (same number of sets, reps, weight and warm-up/drop/failure
// tags), so each one is a single tap. Only for rep-based exercises — cardio
// and timed sets are durations measured live, not targets to repeat.
// Returns null when there's nothing to copy.
export function setsFromPreviousExercise(exName, prevSets) {
  if (!prevSets || prevSets.length === 0) return null;
  if (isCardioExercise(exName) || isTimedExercise(exName)) return null;
  const bodyweight = isBodyweightExercise(exName);
  return prevSets.map(p => {
    const weight = String(Number(p.weight) || 0);
    const setType = p.setType || (p.isWarmup ? 'warmup' : null);
    return {
      reps: p.reps != null && p.reps !== '' ? String(p.reps) : '',
      weight,
      isCompleted: false,
      ...(bodyweight ? { bodyweightMode: !(Number(weight) > 0) } : {}),
      ...(setType === 'warmup' ? { isWarmup: true, setType: 'warmup' } : setType ? { setType } : {})
    };
  });
}
