import { describe, it, expect } from 'vitest';
import {
  findPreviousLoggedSetIn,
  findPreviousExerciseSetsIn,
  applyPrevWeight,
  applyPrevReps,
  applyPrevValues,
  applyPrevRepsAndWeight,
  fillPendingPrevSets,
  setsFromPreviousExercise,
  buildProgressiveOverloadHint
} from './prevSets';

describe('buildProgressiveOverloadHint', () => {
  it('suggests +2.5 on the heaviest working set, ignoring warmups', () => {
    const prev = [{ reps: 12, weight: 60, setType: 'warmup', isWarmup: true }, { reps: 8, weight: 40 }, { reps: 6, weight: 42.5 }];
    expect(buildProgressiveOverloadHint('Bench Press', prev)).toBe('Last: 42.5kg×6 → try 45kg×6');
  });

  it('breaks weight ties by reps', () => {
    expect(buildProgressiveOverloadHint('Bench Press', [{ reps: 6, weight: 40 }, { reps: 8, weight: 40 }]))
      .toBe('Last: 40kg×8 → try 42.5kg×8');
  });

  it('progresses reps instead of weight for pure bodyweight sets', () => {
    expect(buildProgressiveOverloadHint('Push-up', [{ reps: 12, weight: 0 }])).toBe('Last: BW×12 → try BW×13');
  });

  it('returns null with no history, warmup-only history, or cardio/timed exercises', () => {
    expect(buildProgressiveOverloadHint('Bench Press', null)).toBeNull();
    expect(buildProgressiveOverloadHint('Bench Press', [{ reps: 10, weight: 20, isWarmup: true }])).toBeNull();
    expect(buildProgressiveOverloadHint('Treadmill', [{ distanceKm: 2, time: '10:00' }])).toBeNull();
    expect(buildProgressiveOverloadHint('Plank', [{ time: '01:00' }])).toBeNull();
  });
});

const sessions = [
  { clientName: 'Asha', date: '2026-09-01', exercises: [{ name: 'Bench Press', sets: [{ reps: 8, weight: 40 }] }] },
  { clientName: 'Asha', date: '2026-09-10', exercises: [{ name: 'Bench Press', sets: [{ reps: 10, weight: 42.5 }, { reps: 8, weight: 45 }] }] },
  { clientName: 'Someone Else', date: '2026-09-20', exercises: [{ name: 'Bench Press', sets: [{ reps: 5, weight: 100 }] }] }
];

describe('findPreviousLoggedSetIn', () => {
  it('returns the newest matching set for this client, case-insensitively', () => {
    expect(findPreviousLoggedSetIn(sessions, 'asha', 'bench press', 1)).toEqual({ reps: 8, weight: 45 });
  });
  it('falls back to an older session when the newest has no set at that index', () => {
    const withShortNewest = [...sessions, { clientName: 'Asha', date: '2026-09-15', exercises: [{ name: 'Bench Press', sets: [{ reps: 6, weight: 50 }] }] }];
    expect(findPreviousLoggedSetIn(withShortNewest, 'Asha', 'Bench Press', 1)).toEqual({ reps: 8, weight: 45 });
  });
  it('skips the client filter when the list is already one client’s history', () => {
    expect(findPreviousLoggedSetIn(sessions, null, 'Bench Press', 0)).toEqual({ reps: 5, weight: 100 });
  });
  it('returns null when never logged, and tolerates sessions without a clientName', () => {
    expect(findPreviousLoggedSetIn([{ date: '2026-09-01', exercises: [] }, ...sessions], 'Asha', 'Deadlift', 0)).toBeNull();
  });
});

describe('findPreviousExerciseSetsIn', () => {
  it('returns every set from the most recent session with the exercise', () => {
    expect(findPreviousExerciseSetsIn(sessions, 'Asha', 'Bench Press')).toHaveLength(2);
    expect(findPreviousExerciseSetsIn(sessions, 'Asha', 'Deadlift')).toBeNull();
  });
});

describe('applyPrevWeight / applyPrevReps / applyPrevValues / applyPrevRepsAndWeight', () => {
  it('takes the kg from PREV, flags it as unconfirmed, and leaves reps alone', () => {
    expect(applyPrevWeight('Bench Press', { reps: '12', weight: '20' }, { reps: 8, weight: 45 }))
      .toEqual({ reps: '12', weight: '45', weightFromPrev: true });
  });
  it('leaves the set unchanged with no PREV', () => {
    const set = { reps: '12', weight: '' };
    expect(applyPrevWeight('Bench Press', set, null)).toBe(set);
  });
  it('takes the reps from PREV, flags it as unconfirmed, and leaves weight alone', () => {
    expect(applyPrevReps('Bench Press', { reps: '12', weight: '20' }, { reps: 8, weight: 45 }))
      .toEqual({ reps: 8, weight: '20', repsFromPrev: true });
  });
  it('applyPrevValues takes both weight and reps from PREV, each flagged separately', () => {
    expect(applyPrevValues('Bench Press', { reps: '12', weight: '20' }, { reps: 8, weight: 45 }))
      .toEqual({ reps: 8, weight: '45', weightFromPrev: true, repsFromPrev: true });
  });
  it('takes both reps and weight for the Workout Library pre-fill, each flagged', () => {
    expect(applyPrevRepsAndWeight({ reps: 10, weight: '0' }, { reps: 8, weight: 45 }))
      .toEqual({ reps: 8, weight: 45, weightFromPrev: true, repsFromPrev: true });
  });
});

describe('fillPendingPrevSets', () => {
  const lookup = (exName, setIdx) => findPreviousLoggedSetIn(sessions, 'Asha', exName, setIdx);

  it('fills pending sets and clears the flag', () => {
    const exercises = [{ name: 'Bench Press', sets: [
      { reps: 10, weight: '0', isCompleted: false, prevPending: 'template' },
      { reps: '12', weight: '', isCompleted: false, prevPending: 'plan' }
    ] }];
    expect(fillPendingPrevSets(exercises, lookup)[0].sets).toEqual([
      { reps: 10, weight: 42.5, isCompleted: false, weightFromPrev: true, repsFromPrev: true },
      { reps: 8, weight: '45', isCompleted: false, weightFromPrev: true, repsFromPrev: true }
    ]);
  });

  it('never touches a completed set or one without the flag (edited by hand)', () => {
    const exercises = [{ name: 'Bench Press', sets: [
      { reps: 10, weight: '30', isCompleted: true, prevPending: 'template' },
      { reps: 10, weight: '35', isCompleted: false }
    ] }];
    const [ex] = fillPendingPrevSets(exercises, lookup);
    expect(ex.sets[0]).toEqual({ reps: 10, weight: '30', isCompleted: true });
    expect(ex.sets[1]).toBe(exercises[0].sets[1]);
  });

  it('returns the same array when nothing was pending', () => {
    const exercises = [{ name: 'Bench Press', sets: [{ reps: 10, weight: '35', isCompleted: false }] }];
    expect(fillPendingPrevSets(exercises, lookup)).toBe(exercises);
  });
});

describe('setsFromPreviousExercise', () => {
  it('copies last time’s sets, tags included, as uncompleted sets', () => {
    expect(setsFromPreviousExercise('Bench Press', [{ reps: 10, weight: 20, setType: 'warmup' }, { reps: 8, weight: 45 }])).toEqual([
      { reps: '10', weight: '20', isCompleted: false, isWarmup: true, setType: 'warmup' },
      { reps: '8', weight: '45', isCompleted: false }
    ]);
  });
  it('returns null with no history, and for cardio/timed exercises', () => {
    expect(setsFromPreviousExercise('Bench Press', null)).toBeNull();
    expect(setsFromPreviousExercise('Treadmill', [{ distanceKm: 2, time: '10:00' }])).toBeNull();
    expect(setsFromPreviousExercise('Plank', [{ time: '01:00' }])).toBeNull();
  });
});
