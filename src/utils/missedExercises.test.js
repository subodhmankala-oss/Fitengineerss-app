import { describe, it, expect } from 'vitest';
import { canAddMissedExercise, addedLaterExercisesByDate, toSavedMissedExercises, emptyMissedSet } from './missedExercises';
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
