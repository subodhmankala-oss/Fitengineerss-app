// Exercises a client didn't get to (time ran out) carried over to their next
// session. Only FULLY skipped exercises count, meaning not one set ticked. A
// started exercise just saves the sets that were done. Warm-up moves are
// never carried over.
//
// The list lives on the server (workout_leftovers, one row per client), so
// the coach's Live Log and the client's own logger see the same list on any
// phone, after closing the app, or after signing out. localStorage keeps a
// copy for an instant first paint and for offline use; a change made offline
// is marked unsynced and pushed on the next sync instead of being
// overwritten by the older server copy.
//
// The next session shows them on a card (LeftoverExercisesCard) to add or
// dismiss, never auto-inserted, because the next day may be a different
// muscle group.

import { isWarmupCardExercise } from './warmupBlocks';
import databaseService from '../services/databaseService';

export const LEFTOVER_TTL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
export const LEFTOVERS_CHANGED_EVENT = 'workoutLeftoversChanged';

const keyFor = (ownerId) => `workoutLeftovers_${ownerId || 'anon'}`;
const dirtyKeyFor = (ownerId) => `workoutLeftoversUnsynced_${ownerId || 'anon'}`;
const sameName = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

// Names of exercises in a logger session with sets but none ticked.
export function findSkippedExercises(exercises) {
  return (exercises || [])
    .filter(ex => ex && ex.name && !isWarmupCardExercise(ex)
      && Array.isArray(ex.sets) && ex.sets.length > 0
      && !ex.sets.some(s => s.isCompleted))
    .map(ex => ex.name);
}

const freshOnly = (items, now) => (Array.isArray(items) ? items : []).filter(it => it && typeof it.name === 'string' && it.name
  && Number.isFinite(it.savedAt) && now - it.savedAt < LEFTOVER_TTL_DAYS * DAY_MS);

function announce(ownerId) {
  try { window.dispatchEvent(new CustomEvent(LEFTOVERS_CHANGED_EVENT, { detail: { ownerId } })); } catch { /* no window */ }
}

function writeLocal(ownerId, items) {
  try {
    if (items.length) localStorage.setItem(keyFor(ownerId), JSON.stringify(items));
    else localStorage.removeItem(keyFor(ownerId));
  } catch { /* storage full/blocked */ }
}

function setUnsynced(ownerId, on) {
  try {
    if (on) localStorage.setItem(dirtyKeyFor(ownerId), '1');
    else localStorage.removeItem(dirtyKeyFor(ownerId));
  } catch { /* ignore */ }
}

const isUnsynced = (ownerId) => {
  try { return localStorage.getItem(dirtyKeyFor(ownerId)) === '1'; } catch { return false; }
};

// Server calls never throw: a failure just means "try again on the next sync".
async function callServer(method, ...args) {
  try {
    return await databaseService[method](...args);
  } catch {
    return null;
  }
}

async function push(ownerId, items) {
  const ok = await callServer('saveWorkoutLeftoversRemote', ownerId, items);
  if (ok) setUnsynced(ownerId, false);
  return !!ok;
}

// A user change: saved locally right away, then sent to the server.
function write(ownerId, items) {
  writeLocal(ownerId, items);
  setUnsynced(ownerId, true);
  announce(ownerId);
  return push(ownerId, items);
}

// [{ name, date, planName, savedAt }] from this phone's copy. Entries older
// than the TTL are dropped. Call syncWorkoutLeftovers to refresh it.
export function getWorkoutLeftovers(ownerId, now = Date.now()) {
  let items;
  try {
    items = JSON.parse(localStorage.getItem(keyFor(ownerId)) || '[]');
  } catch {
    items = [];
  }
  if (!Array.isArray(items)) items = [];
  const fresh = freshOnly(items, now);
  if (fresh.length !== items.length) writeLocal(ownerId, fresh);
  return fresh;
}

// Brings this phone's copy in line with the server. An unsynced local change
// is pushed first; otherwise the server copy replaces the local one. A failed
// read leaves the local copy alone.
export async function syncWorkoutLeftovers(ownerId, now = Date.now()) {
  if (!ownerId) return [];
  if (isUnsynced(ownerId)) {
    await push(ownerId, getWorkoutLeftovers(ownerId, now));
    return getWorkoutLeftovers(ownerId, now);
  }
  const remote = await callServer('getWorkoutLeftoversRemote', ownerId);
  // Not an array: the read failed (or the table isn't there) — keep ours.
  // A change made while the read was in flight also wins.
  if (!Array.isArray(remote) || isUnsynced(ownerId)) return getWorkoutLeftovers(ownerId, now);
  const fresh = freshOnly(remote, now);
  let before = '[]';
  try { before = localStorage.getItem(keyFor(ownerId)) || '[]'; } catch { /* ignore */ }
  writeLocal(ownerId, fresh);
  if (JSON.stringify(fresh) !== (before === '[]' ? '[]' : before)) announce(ownerId);
  return fresh;
}

// Called on every saved session: leftovers the client did this time are
// cleared, and this session's skipped exercises are added (replacing an older
// entry with the same name).
export function updateWorkoutLeftovers(ownerId, { skipped = [], completed = [], date, planName }, now = Date.now()) {
  const kept = getWorkoutLeftovers(ownerId, now)
    .filter(it => !completed.some(n => sameName(n, it.name)) && !skipped.some(n => sameName(n, it.name)));
  const added = skipped
    .filter((n, i) => skipped.findIndex(m => sameName(m, n)) === i)
    .map(name => ({ name, date: date || null, planName: planName || null, savedAt: now }));
  return write(ownerId, [...kept, ...added]);
}

// Removes the given names (added to a workout), or everything when omitted (dismissed).
export function clearWorkoutLeftovers(ownerId, names) {
  if (!names) return write(ownerId, []);
  return write(ownerId, getWorkoutLeftovers(ownerId).filter(it => !names.some(n => sameName(n, it.name))));
}
