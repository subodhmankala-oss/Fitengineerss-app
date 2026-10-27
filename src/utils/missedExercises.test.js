import { describe, it, expect } from 'vitest';
import { canAddMissedExercise, addedLaterExercisesByDate, toSavedMissedExercises, emptyMissedSet, buildEditableWorkout, diffEditableWorkout } from './missedExercises';
import { estimateMissedSetsKcal } from './liveWorkoutTimer';

describe('canAddMissedExercise', () => {
  const today = '2026-10-27';
  it('allows today and the six days before it', () => {
    expect(canAddMissedExercise('2026-10-27', today)).toBe(true);
    expect(canAddMissedExercise('2026-10-21', today)).toBe(true);
  });
  it('refuses older days and the future', () => {
    expect(canAddMissedExercise('2026-10-20', today)).toBe(false);
    expect(canAddMissedExercise('2026-10-28', today)).toBe(false);
    expect(canAddMissedExercise('', today)).toBe(false);
  });
});

describe('addedLaterExercisesByDate', () => {
  it('flags only exercises saved later into the same session', () => {
    const rows = [
      { log_date: '2026-10-27', exercise_name: 'Bench Press', session_id: 's1', created_at: '2026-10-27T10:00:00Z' },
      { log_date: '2026-10-27', exercise_name: 'Triceps Pushdown', session_id: 's1', created_at: '2026-10-27T13:30:00Z' },
      // A separate second workout that day is not "added later".
      { log_date: '2026-10-27', exercise_name: 'Running', session_id: 's2', created_at: '2026-10-27T18:00:00Z' }
    ];
    const byDate = addedLaterExercisesByDate(rows);
    expect([...byDate['2026-10-27']]).toEqual(['triceps pushdown']);
  });
  it('ignores rows without a session_id', () => {
    expect(addedLaterExercisesByDate([{ log_date: 'd', exercise_name: 'X', created_at: '2026-10-27T10:00:00Z' }])).toEqual({});
  });
});

describe('toSavedMissedExercises', () => {
  it('keeps filled sets only, in the saved-set shape', () => {
    const saved = toSavedMissedExercises([
      { name: 'Triceps Pushdown', sets: [{ weight: '25', reps: '12' }, { weight: '25', reps: '' }] },
      { name: 'Plank', sets: [{ time: '01:00' }] },
      { name: 'Bench Press', sets: [emptyMissedSet('Bench Press')] }
    ]);
    expect(saved).toEqual([
      { name: 'Triceps Pushdown', sets: [{ reps: 12, weight: 25 }] },
      // Bodyweight timed hold: weight 0 = BW, same as the logger saves it.
      { name: 'Plank', sets: [{ time: '01:00', weight: 0 }] }
    ]);
  });
});

describe('estimateMissedSetsKcal', () => {
  it('prices sets without timestamps, and more sets burn more', () => {
    const one = estimateMissedSetsKcal([{ name: 'Triceps Pushdown', sets: [{ reps: 12, weight: 25 }] }], 70);
    const three = estimateMissedSetsKcal([{ name: 'Triceps Pushdown', sets: [{ reps: 12, weight: 25 }, { reps: 10, weight: 25 }, { reps: 10, weight: 25 }] }], 70);
    expect(one).toBeGreaterThan(0);
    expect(three).toBeGreaterThan(one * 2);
  });
  it('is zero for nothing', () => {
    expect(estimateMissedSetsKcal([], 70)).toBe(0);
  });
});

describe('edit workout helpers', () => {
  const rows = [
    { id: 'b', exercise_name: 'Bench Press', reps: 10, weight_kg: 60, created_at: '2026-10-27T10:00:00Z', session_row: 1 },
    { id: 'a', exercise_name: 'Bench Press', reps: 10, weight_kg: 60, created_at: '2026-10-27T10:00:00Z', session_row: 0 },
    { id: 'c', exercise_name: 'Cycling', distance_km: 2, cardio_duration_seconds: 300, reps: 0, weight_kg: 0, created_at: '2026-10-27T10:00:00Z', session_row: 2 }
  ];

  it('builds exercises in saved order with form values', () => {
    const ex = buildEditableWorkout(rows);
    expect(ex.map(e => e.name)).toEqual(['Bench Press', 'Cycling']);
    expect(ex[0].sets.map(s => s.id)).toEqual(['a', 'b']);
    expect(ex[0].sets[0].values).toEqual({ weight: '60', reps: '10' });
    expect(ex[1].sets[0].values).toEqual({ distanceKm: '2', time: '05:00', distanceKmAuto: false });
  });

  it('sends only changed and removed sets, with calorie deltas', () => {
    const ex = buildEditableWorkout(rows);
    ex[0].sets[0] = { ...ex[0].sets[0], values: { weight: '70', reps: '10' } };
    ex[1].sets[0] = { ...ex[1].sets[0], deleted: true };
    const diff = diffEditableWorkout(ex, 70);
    expect(diff.changes).toEqual([{ id: 'a', name: 'Bench Press', set: { reps: 10, weight: 70 } }]);
    expect(diff.deletes).toEqual(['c']);
    expect(diff.kcalDeltas.a).toBeGreaterThanOrEqual(0);
    expect(diff.kcalDeltas.c).toBeLessThan(0);
  });

  it('asks to remove a set instead of emptying it', () => {
    const ex = buildEditableWorkout(rows);
    ex[0].sets[0] = { ...ex[0].sets[0], values: { weight: '60', reps: '' } };
    expect(diffEditableWorkout(ex, 70).error).toMatch(/Bench Press/);
  });
});
