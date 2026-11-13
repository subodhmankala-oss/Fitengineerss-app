// Keeps one finished workout from being saved twice.
//
// A saved workout's id used to be stamped from Date.now() when Save was
// tapped, so saving the same workout again produced a new id that
// workout_logs_session_row_key couldn't recognise. It happened when the app
// reloaded right after Save: the save still landed (from the retry queue),
// but the "delete the open workout" request was lost in the reload, so the
// app reopened the finished workout as if it were in progress, and the next
// Save stored a full second copy (2026-11-13: a 33-set session saved 11
// minutes apart, 376 + 375 kcal on the gym board).
//
// The id now comes from the workout clock's start, which is the same for
// every save of one workout, so a repeat is rejected by the unique index and
// treated as already saved. The start of each saved workout is also
// remembered on this device, so a leftover open copy is closed instead of
// being reopened.

const STORAGE_KEY = 'savedWorkoutStarts';
const MAX_REMEMBERED = 20;

export function finishedSessionId(prefix, timerStartedAt, now = Date.now()) {
  const start = Number(timerStartedAt);
  return `${prefix}-${start > 0 ? start : now}`;
}

function readStarts() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// scope tells apart whose workout it is: 'self' for the client's own logger,
// `coach:<clientId>` for the coach's Live Log.
export function rememberSavedWorkout(scope, timerStartedAt) {
  const start = Number(timerStartedAt);
  if (!(start > 0)) return;
  const entry = `${scope}|${start}`;
  const list = readStarts().filter((e) => e !== entry);
  list.push(entry);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_REMEMBERED)));
  } catch {
    // Storage full or blocked: the session id above still blocks the copy.
  }
}

export function wasWorkoutSaved(scope, timerStartedAt) {
  const start = Number(timerStartedAt);
  if (!(start > 0)) return false;
  return readStarts().includes(`${scope}|${start}`);
}
