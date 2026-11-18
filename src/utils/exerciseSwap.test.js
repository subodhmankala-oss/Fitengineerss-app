import { describe, it, expect } from 'vitest';
import { applyLiveSwap, buildSwapEntry, buildSwapSets, canUndoSwap, dropSetTimersForExercise, lastSetLabel, remapSetTimersForSwap, undoLiveSwap } from './exerciseSwap';
import { buildAiCatalog, equipmentLabel, swapAlternatives, swapMatchPercent } from './aiWorkoutCatalog';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';

const bench = (ticked) => ({
  name: 'Bench Press (Barbell)',
  sets: [0, 1, 2, 3].map(i => ({ reps: '8', weight: '5', isCompleted: i < ticked }))
});
const row = { name: 'Seated Cable Row', sets: [{ reps: '10', weight: '30', isCompleted: false }] };
const db = { name: 'Dumbbell Bench Press' };

describe('buildSwapSets', () => {
  it('keeps the reps target, fills kg from the new exercise PREV, never a made-up weight', () => {
    const sets = buildSwapSets('Dumbbell Bench Press', [{ reps: '8' }, { reps: '8' }], [{ reps: '10', weight: '14' }]);
    expect(sets).toHaveLength(2);
    expect(sets[0].weight).toBe('14');
    expect(sets[0].reps).toBe('10');
    expect(sets[1].weight).toBe('14');
    const blank = buildSwapSets('Dumbbell Bench Press', [{ reps: '8' }], null);
    expect(blank[0]).toMatchObject({ reps: '8', weight: '', isCompleted: false });
  });

  it('uses the new exercise shape (a plank logs time, not reps)', () => {
    const [s] = buildSwapSets('Plank', [{ reps: '8', weight: '20' }], null);
    expect(s.reps).toBeUndefined();
    expect(s).toHaveProperty('time', '');
  });
});

describe('applyLiveSwap', () => {
  it('replaces the card in place when nothing is ticked', () => {
    const entry = buildSwapEntry(bench(0), db, { by: 'client' });
    const { exercises, split } = applyLiveSwap([bench(0), row], 0, entry);
    expect(split).toBe(false);
    expect(exercises.map(e => e.name)).toEqual(['Dumbbell Bench Press', 'Seated Cable Row']);
    expect(exercises[0].sets).toHaveLength(4);
    expect(exercises[0]).toMatchObject({ swappedFrom: 'Bench Press (Barbell)', swapBy: 'client' });
  });

  it('keeps ticked sets on the original and adds the new card after it with the rest', () => {
    const old = bench(2);
    const entry = buildSwapEntry(old, db, { by: 'coach' });
    const { exercises, split } = applyLiveSwap([old, row], 0, entry);
    expect(split).toBe(true);
    expect(exercises.map(e => e.name)).toEqual(['Bench Press (Barbell)', 'Dumbbell Bench Press', 'Seated Cable Row']);
    expect(exercises[0].sets.every(s => s.isCompleted)).toBe(true);
    expect(exercises[0].sets).toHaveLength(2);
    expect(exercises[1].sets).toHaveLength(2);
  });
});

describe('undoLiveSwap', () => {
  it('puts the original back in place', () => {
    const old = bench(0);
    const { exercises } = applyLiveSwap([old, row], 0, buildSwapEntry(old, db));
    const undone = undoLiveSwap(exercises, 0);
    expect(undone.exercises[0]).toBe(old);
    expect(undone.merged).toBe(false);
  });

  it('merges a split back into one card', () => {
    const old = bench(2);
    const { exercises } = applyLiveSwap([old, row], 0, buildSwapEntry(old, db));
    const undone = undoLiveSwap(exercises, 1);
    expect(undone.merged).toBe(true);
    expect(undone.exercises.map(e => e.name)).toEqual(['Bench Press (Barbell)', 'Seated Cable Row']);
    expect(undone.exercises[0].sets).toHaveLength(4);
  });

  it('is gone once a set of the new card is ticked', () => {
    const old = bench(0);
    const { exercises } = applyLiveSwap([old], 0, buildSwapEntry(old, db));
    const ticked = { ...exercises[0], sets: exercises[0].sets.map((s, i) => ({ ...s, isCompleted: i === 0 })) };
    expect(canUndoSwap(ticked)).toBe(false);
    expect(undoLiveSwap([ticked], 0).exercises[0]).toBe(ticked);
  });
});

describe('set timers', () => {
  const timers = { '0,1': 'a', '0,3': 'b', '1,0': 'c' };
  it('drops the swapped card timers when swapped in place', () => {
    expect(remapSetTimersForSwap(0, bench(0).sets, false, timers)).toEqual({ '1,0': 'c' });
  });
  it('keeps ticked-set timers and shifts later cards on a split', () => {
    expect(remapSetTimersForSwap(0, bench(2).sets, true, timers)).toEqual({ '0,1': 'a', '2,0': 'c' });
  });
  it('drops one card timers', () => {
    expect(dropSetTimersForExercise(0, timers)).toEqual({ '1,0': 'c' });
  });
});

describe('match % and labels', () => {
  const catalog = buildAiCatalog({ staticLibrary: EXERCISE_LIBRARY });
  it('scores a same-muscle, same-movement swap above a loose one, never 100', () => {
    const alts = swapAlternatives('Bench Press (Barbell)', catalog, { limit: 40 });
    const scores = alts.map(a => swapMatchPercent('Bench Press (Barbell)', a, catalog));
    expect(Math.max(...scores)).toBeLessThan(100);
    const dbScore = swapMatchPercent('Bench Press (Barbell)', { name: 'Dumbbell Bench Press', muscle: alts[0].muscle }, catalog);
    const flyScore = swapMatchPercent('Bench Press (Barbell)', { name: 'Cable Fly', muscle: alts[0].muscle }, catalog);
    expect(dbScore).toBeGreaterThan(flyScore);
  });

  it('labels equipment from the name', () => {
    expect(equipmentLabel('Dumbbell Bench Press')).toBe('Dumbbell');
    expect(equipmentLabel('Chest Press Machine')).toBe('Machine');
    expect(equipmentLabel('Push-Up')).toBeNull();
  });

  it('shows the last set as kg × reps or BW', () => {
    expect(lastSetLabel('Dumbbell Bench Press', [{ weight: '14', reps: '10' }])).toBe('14 kg × 10');
    expect(lastSetLabel('Push-Up', [{ weight: '0', reps: '15' }])).toBe('BW × 15');
    expect(lastSetLabel('Push-Up', null)).toBeNull();
  });
});

describe('isSameExerciseName', () => {
  it('treats a renamed copy as the same exercise, a different variation as not', async () => {
    const { isSameExerciseName } = await import('./aiWorkoutCatalog');
    expect(isSameExerciseName('Bench Press (Barbell)', 'Bench Press')).toBe(true);
    expect(isSameExerciseName('Bench Press (Barbell)', 'Barbell Bench Press')).toBe(true);
    expect(isSameExerciseName('Bench Press (Barbell)', 'Bench Press (Dumbbell)')).toBe(false);
    expect(isSameExerciseName('Bench Press (Barbell)', 'Incline Bench Press (Barbell)')).toBe(false);
  });
});
