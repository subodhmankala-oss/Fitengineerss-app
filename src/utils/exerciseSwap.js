// Live "Swap exercise" in the client logger and the coach Live Log (the ≡
// card menu → LiveSwapSheet). Plain functions so both loggers do exactly the
// same thing and the tests can cover it without rendering either one.
//
// The rule: sets already ticked stay logged under the exercise they were
// done on. A swap with nothing ticked replaces the card in place; a swap
// part-way through keeps the ticked sets on the original card and puts the
// new exercise right after it with the sets that were still to do. The new
// card remembers what it replaced (`swapUndo`) so Undo can put it back until
// one of its own sets is ticked. `swapUndo` lives in the in-progress draft
// (so Undo survives a reload) but never reaches the saved logs — the save
// step copies only named fields.

import { isBodyweightExercise, isCardioExercise, isLoadedCarryExercise, isTimedExercise, isWarmupExercise } from '../data/exerciseLibrary';
import { applyPrevValues } from './prevSets';
import { exerciseIdField } from './exerciseName';

const repsShaped = (name) => !isCardioExercise(name) && !isTimedExercise(name) && !isLoadedCarryExercise(name);

// The empty set the new exercise logs with — its own shape, not the old
// one's (a cable move swapped for a plank logs a time, not reps).
function freshSetFor(name) {
  const bodyweight = isBodyweightExercise(name);
  if (isCardioExercise(name)) return { distanceKm: '', time: '', isCompleted: false };
  if (isTimedExercise(name) && bodyweight) return { time: '', weight: '0', isCompleted: false };
  if (isTimedExercise(name)) return { time: '', isCompleted: false };
  return { reps: '10', weight: bodyweight || isWarmupExercise(name) ? '0' : '', isCompleted: false };
}

// One new set per set still to do: the old set's reps target when both
// exercises log reps, its warm-up/drop/failure tag, then kg and reps from
// the new exercise's own PREV (set 1 from its last set 1, …). Never a
// made-up weight: no PREV leaves the kg box blank.
export function buildSwapSets(newName, setsToDo, prevSets = null) {
  const keepReps = repsShaped(newName);
  const source = setsToDo.length > 0 ? setsToDo : [{}];
  return source.map((old, i) => {
    let set = freshSetFor(newName);
    if (keepReps && repsShaped(old.__name || newName) && old.reps != null && old.reps !== '') set.reps = String(old.reps);
    if (old.isWarmup) set.isWarmup = true;
    if (old.setType && old.setType !== 'normal') set.setType = old.setType;
    const prev = prevSets && prevSets.length > 0 ? prevSets[Math.min(i, prevSets.length - 1)] : null;
    set = applyPrevValues(newName, set, prev);
    return set;
  });
}

// The new card for `record` ({ name, exerciseId? }) replacing `oldEntry`.
// `by` is 'client' or 'coach' (the caption says who swapped).
export function buildSwapEntry(oldEntry, record, { by = 'client', prevSets = null } = {}) {
  const todo = (oldEntry.sets || []).filter(s => !s.isCompleted);
  const sets = buildSwapSets(record.name, todo.map(s => ({ ...s, __name: oldEntry.name })), prevSets);
  return {
    name: record.name,
    ...exerciseIdField(record.exerciseId),
    sets,
    ...(isBodyweightExercise(record.name) ? { bodyweightMode: true } : {}),
    swappedFrom: oldEntry.name,
    swapBy: by
  };
}

// Puts `newEntry` in place of exercises[exIdx]. Returns the new list and
// whether the original stayed (split) because some of its sets were ticked.
export function applyLiveSwap(exercises, exIdx, newEntry) {
  const old = exercises[exIdx];
  if (!old) return { exercises, split: false };
  const done = old.sets.filter(s => s.isCompleted);
  const todo = old.sets.filter(s => !s.isCompleted);
  if (done.length === 0) {
    const replaced = { ...newEntry, swapUndo: { entry: old } };
    return { exercises: exercises.map((ex, i) => (i === exIdx ? replaced : ex)), split: false };
  }
  // The ticked sets stay where they are; the new card takes the rest.
  const kept = { ...old, sets: done };
  const added = { ...newEntry, swapUndo: { sets: todo } };
  const next = exercises.slice();
  next.splice(exIdx, 1, kept, added);
  return { exercises: next, split: true };
}

// Set timers are keyed "exIdx,setIdx" by position (getSetTimerKey). A swap
// in place drops the swapped card's timers (its sets are new); a split keeps
// the ticked sets' timers at their new positions on the original card and
// moves every later card's timers one card down.
export function remapSetTimersForSwap(exIdx, oldSets, split, timers) {
  if (!timers || Object.keys(timers).length === 0) return timers;
  const keptPos = new Map();
  if (split) {
    let n = 0;
    oldSets.forEach((s, i) => { if (s.isCompleted) keptPos.set(i, n++); });
  }
  const out = {};
  Object.keys(timers).forEach(key => {
    const [exPart, setPart] = key.split(',');
    const ex = Number(exPart);
    const set = Number(setPart);
    if (ex < exIdx) { out[key] = timers[key]; return; }
    if (ex === exIdx) {
      if (keptPos.has(set)) out[`${ex},${keptPos.get(set)}`] = timers[key];
      return;
    }
    out[`${split ? ex + 1 : ex},${set}`] = timers[key];
  });
  return out;
}

// Undo is offered until one of the new card's own sets is ticked.
export const canUndoSwap = (entry) =>
  !!entry?.swapUndo && !(entry.sets || []).some(s => s.isCompleted);

// Reverses applyLiveSwap for the card at idx. Returns the new list and
// whether a split was merged back (the caller removes that card's timers
// with remapSetTimersForExerciseRemoval; otherwise it drops them in place).
export function undoLiveSwap(exercises, idx) {
  const entry = exercises[idx];
  if (!canUndoSwap(entry)) return { exercises, merged: false };
  if (entry.swapUndo.entry) {
    return { exercises: exercises.map((ex, i) => (i === idx ? entry.swapUndo.entry : ex)), merged: false };
  }
  const prev = exercises[idx - 1];
  const next = exercises.slice();
  if (prev && prev.name === entry.swappedFrom) {
    next[idx - 1] = { ...prev, sets: [...prev.sets, ...entry.swapUndo.sets] };
  }
  next.splice(idx, 1);
  return { exercises: next, merged: true };
}

// Drops timers on one card (used after an in-place undo: the card's sets
// are the original's again, none of the swapped card's timers apply).
export function dropSetTimersForExercise(exIdx, timers) {
  if (!timers || Object.keys(timers).length === 0) return timers;
  const out = {};
  Object.keys(timers).forEach(key => { if (Number(key.split(',')[0]) !== exIdx) out[key] = timers[key]; });
  return out;
}

// "14 kg × 10" / "BW × 15" from a PREV set list, or null when never done.
export function lastSetLabel(name, prevSets) {
  const p = prevSets && prevSets[0];
  if (!p) return null;
  if (isCardioExercise(name)) return p.distanceKm ? `${p.distanceKm} km${p.time ? ` · ${p.time}` : ''}` : null;
  if (isTimedExercise(name)) return p.time || null;
  const w = Number(p.weight) || 0;
  const weight = isBodyweightExercise(name) && !(w > 0) ? 'BW' : `${w} kg`;
  return p.reps != null && p.reps !== '' ? `${weight} × ${p.reps}` : weight;
}
