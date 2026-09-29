// Per-set stopwatches (cardio and timed holds) are keyed by position —
// "exIdx,setIdx" — in WorkoutTracker's setTimers and TrainerDashboard's
// liveSetTimers. Each entry is timestamp-based ({ isRunning, startedAt,
// pausedDuration, ... }), so one saved before the page went away is still
// correct afterwards: a running one has simply kept counting.
//
// Phones routinely throw away a backgrounded PWA's page and reload it when
// it's opened again (and App.jsx itself reloads after 15 minutes hidden).
// The session clock survived that, but these stopwatches only lived in
// React state, so a treadmill or plank set that was running while the phone
// was locked came back empty.
//
// When the exercises come back from a draft, keep a saved stopwatch only if
// the same exercise is still at that position and the set is still there
// and not ticked off — never let it land on a different exercise.
// `fromExercises` is the list the timers were keyed against (exercise
// objects or plain names); `toExercises` is the list being restored.
export function keepSetTimersForSameExercises(timers, fromExercises, toExercises) {
  if (!timers || typeof timers !== 'object') return {};
  const kept = {};
  Object.keys(timers).forEach((key) => {
    const [exPart, setPart] = key.split(',');
    const exIdx = Number(exPart);
    const setIdx = Number(setPart);
    const from = fromExercises?.[exIdx];
    const fromName = typeof from === 'string' ? from : from?.name;
    const to = toExercises?.[exIdx];
    if (!fromName || !to || to.name !== fromName) return;
    const set = to.sets?.[setIdx];
    if (!set || set.isCompleted) return;
    kept[key] = timers[key];
  });
  return kept;
}

// The stopwatches in a saved { sessionStartedAt, timers, names } entry, for
// the session whose clock started at `sessionStartedAt` — none if the entry
// belongs to a different session (one finished or discarded somewhere that
// didn't clear it), so they can never reappear in a later workout — kept
// only where `exercises` still lines up (see above).
export function restoreSavedSetTimers(saved, sessionStartedAt, exercises) {
  if (!saved || Number(saved.sessionStartedAt) !== Number(sessionStartedAt)) return {};
  return keepSetTimersForSameExercises(saved.timers, saved.names, exercises);
}

// Reads a { sessionStartedAt, timers, names } entry written by the save
// effects in WorkoutTracker/TrainerDashboard. null when there's nothing
// usable.
export function readSavedSetTimers(storageKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!saved || !saved.timers || typeof saved.timers !== 'object' || !Array.isArray(saved.names)) return null;
    return saved;
  } catch {
    return null;
  }
}
