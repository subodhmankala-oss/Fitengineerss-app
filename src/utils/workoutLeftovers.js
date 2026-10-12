// Coach Live Log: exercises the client didn't get to (time ran out) carried
// over to their next session. Only FULLY skipped exercises count, meaning not
// one set ticked. A started exercise just saves the sets that were done.
// Warm-up moves are never carried over. Coach-only for now; the client's own
// logger doesn't use this.
//
// Stored in localStorage on the coach's device (like pendingWorkoutAdds),
// keyed by the client's users.id. The next Live Log session for that client
// shows them on a card (LeftoverExercisesCard) to add or dismiss, never
// auto-inserted, because the next day may be a different muscle group.

import { isWarmupCardExercise } from './warmupBlocks';

export const LEFTOVER_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const keyFor = (ownerId) => `workoutLeftovers_${ownerId || 'anon'}`;
const sameName = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

// Names of exercises in a logger session with sets but none ticked.
export function findSkippedExercises(exercises) {
  return (exercises || [])
    .filter(ex => ex && ex.name && !isWarmupCardExercise(ex)
      && Array.isArray(ex.sets) && ex.sets.length > 0
      && !ex.sets.some(s => s.isCompleted))
    .map(ex => ex.name);
}

function write(ownerId, items) {
  try {
    if (items.length) localStorage.setItem(keyFor(ownerId), JSON.stringify(items));
    else localStorage.removeItem(keyFor(ownerId));
  } catch { /* storage full/blocked: carry-over is best-effort */ }
}

// [{ name, date, planName, savedAt }]. Entries older than the TTL are dropped.
export function getWorkoutLeftovers(ownerId, now = Date.now()) {
  let items;
  try {
    items = JSON.parse(localStorage.getItem(keyFor(ownerId)) || '[]');
  } catch {
    items = [];
  }
  if (!Array.isArray(items)) items = [];
  const fresh = items.filter(it => it && typeof it.name === 'string' && it.name
    && Number.isFinite(it.savedAt) && now - it.savedAt < LEFTOVER_TTL_DAYS * DAY_MS);
  if (fresh.length !== items.length) write(ownerId, fresh);
  return fresh;
}

// Called on every saved Live Log session: leftovers the client did this time are
// cleared, and this session's skipped exercises are added (replacing an older
// entry with the same name).
export function updateWorkoutLeftovers(ownerId, { skipped = [], completed = [], date, planName }, now = Date.now()) {
  const kept = getWorkoutLeftovers(ownerId, now)
    .filter(it => !completed.some(n => sameName(n, it.name)) && !skipped.some(n => sameName(n, it.name)));
  const added = skipped
    .filter((n, i) => skipped.findIndex(m => sameName(m, n)) === i)
    .map(name => ({ name, date: date || null, planName: planName || null, savedAt: now }));
  write(ownerId, [...kept, ...added]);
}

// Removes the given names (added to a workout), or everything when omitted (dismissed).
export function clearWorkoutLeftovers(ownerId, names) {
  if (!names) { write(ownerId, []); return; }
  write(ownerId, getWorkoutLeftovers(ownerId).filter(it => !names.some(n => sameName(n, it.name))));
}
