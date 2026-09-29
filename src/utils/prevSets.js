import { isCardioExercise, isTimedExercise, isBodyweightExercise } from '../data/exerciseLibrary';

// "What did this client do last time?" lookups for the live logger's PREV
// column and its pre-fill. Pure functions over the in-memory session list
// (the same list the Progress tab graphs), so they can run both at render
// time and from the async callback that delivers the DB history.

const byNewestFirst = (a, b) => new Date(b.date) - new Date(a.date);

// clientName null = the list is already one client's history (the coach
// Live Log's workoutLogs), so nothing to filter.
const clientSessionsNewestFirst = (sessions, clientName) => (sessions || [])
  .filter(s => clientName == null || (s.clientName || '').toLowerCase() === clientName.toLowerCase())
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

// The notes from the most recent session that has this exercise ('' when
// that session had none — so clearing a note stops it carrying forward), or
// null when the client has never logged it.
export function findPreviousExerciseNotesIn(sessions, clientName, exName) {
  const name = (exName || '').toLowerCase();
  for (const session of clientSessionsNewestFirst(sessions, clientName)) {
    const exercise = (session.exercises || []).find(e => (e.name || '').toLowerCase() === name);
    if (exercise) return exercise.notes || '';
  }
  return null;
}

// A plan's kg/BW box starts from PREV (see withPrevValues in
// WorkoutTracker). Cardio and plain timed sets have no weight and are
// returned unchanged, as are sets the client has never logged. Flags
// weightFromPrev so the input can render the value as an unconfirmed
// "ghost" until the client edits or completes the set (see SetValueField).
export function applyPrevWeight(exName, set, prev) {
  if (isCardioExercise(exName)) return set;
  if (isTimedExercise(exName) && !isBodyweightExercise(exName)) return set;
  if (!prev || prev.weight == null || prev.weight === '') return set;
  const weight = String(Number(prev.weight) || 0);
  return {
    ...set,
    weight,
    weightFromPrev: true,
    ...(isBodyweightExercise(exName) ? { bodyweightMode: !(Number(weight) > 0) } : {})
  };
}

// Same idea for the reps box: a plan's per-set reps is the coach's target,
// a reasonable default until the client has actually logged that set once —
// after that PREV is a better prediction than a target that may be weeks
// stale. Cardio/timed sets have no reps box.
export function applyPrevReps(exName, set, prev) {
  if (isCardioExercise(exName) || isTimedExercise(exName)) return set;
  if (!prev || prev.reps == null || prev.reps === '') return set;
  return { ...set, reps: prev.reps, repsFromPrev: true };
}

// Both together — the normal case for an assigned-plan set once PREV exists.
export function applyPrevValues(exName, set, prev) {
  return applyPrevReps(exName, applyPrevWeight(exName, set, prev), prev);
}

// The Workout Library's pre-fill (handleStartFromTemplate): reps and weight
// both come from PREV when there is one.
export function applyPrevRepsAndWeight(set, prev) {
  if (!prev) return set;
  return {
    ...set,
    reps: prev.reps || set.reps,
    weight: prev.weight || set.weight,
    ...(prev.reps ? { repsFromPrev: true } : {}),
    ...(prev.weight ? { weightFromPrev: true } : {})
  };
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
          : applyPrevValues(ex.name, rest, prev);
      })
    };
  });
  return changed ? next : exercises;
}

// Progressive-overload hint shown under an exercise card: "Last: 40kg×8 →
// try 42.5kg×8". Built from the same last-session sets findPreviousExerciseSetsIn
// already resolves — takes the result directly rather than sessions/clientName
// so it stays a plain function of data, easy to call from either the client
// logger or the coach's Live Log. Picks the heaviest working (non-warmup)
// set to progress, since that's the one a "next time" bump is normally about;
// warmup sets are never the ones being progressed. Suggests +2.5 (the usual
// smallest plate jump) when there's already added
// weight, or +1 rep when there's none to add to yet (true bodyweight reps,
// or an unusual 0kg entry) — a weight jump from 0 would be a guess, not a
// read of what the client actually did. Returns null when there's nothing
// to base a suggestion on (no history, cardio/timed exercise, warmup-only).
export function buildProgressiveOverloadHint(exName, prevSets) {
  if (!prevSets || prevSets.length === 0) return null;
  if (isCardioExercise(exName) || isTimedExercise(exName)) return null;
  const working = prevSets.filter(s => !s.isWarmup && s.setType !== 'warmup');
  if (working.length === 0) return null;
  const best = working.reduce((top, s) => {
    const w = Number(s.weight) || 0;
    const topW = Number(top.weight) || 0;
    if (w > topW) return s;
    if (w === topW && (Number(s.reps) || 0) > (Number(top.reps) || 0)) return s;
    return top;
  });
  const reps = Number(best.reps) || 0;
  if (!reps) return null;
  const weight = Number(best.weight) || 0;
  const bodyweight = isBodyweightExercise(exName);
  const unit = /lat pull|plate/i.test(exName) ? 'plates' : 'kg';
  const label = (w) => (bodyweight && !(w > 0)) ? 'BW' : `${w}${unit}`;
  if (weight > 0) {
    const nextWeight = Math.round((weight + 2.5) * 10) / 10;
    return `Last: ${label(weight)}×${reps} → try ${label(nextWeight)}×${reps}`;
  }
  return `Last: ${label(weight)}×${reps} → try ${label(weight)}×${reps + 1}`;
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
