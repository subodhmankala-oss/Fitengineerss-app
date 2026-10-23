import { describe, it, expect } from 'vitest';
import {
  findPreviousLoggedSetIn,
  findPreviousExerciseSetsIn,
  applyPrevWeight,
  applyPrevReps,
  applyPrevValues,
  applyPrevRepsAndWeight,
  fillPendingPrevSets,
  setsFromPreviousExercise
} from './prevSets';

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
  it('finds history logged under a spelling variant of the plan name', () => {
    const faceHistory = [{ clientName: 'Asha', date: '2026-09-01', exercises: [{ name: 'Face Pull', sets: [{ reps: 15, weight: 12.5 }] }] }];
    expect(findPreviousLoggedSetIn(faceHistory, 'Asha', 'Face Pulls', 0)).toEqual({ reps: 15, weight: 12.5 });
    expect(findPreviousLoggedSetIn(faceHistory, 'Asha', 'Face Pull (Cable)', 0)).toBeNull();
  });
  it('returns null when never logged, and tolerates sessions without a clientName', () => {
    expect(findPreviousLoggedSetIn([{ date: '2026-09-01', exercises: [] }, ...sessions], 'Asha', 'Deadlift', 0)).toBeNull();
  });
});

describe('library id lookups', () => {
  const FACE = '11111111-1111-4111-8111-111111111111';
  const CUSTOM = '22222222-2222-4222-8222-222222222222';
  const history = [
    // Logged before ids existed: name only.
    { clientName: 'Asha', date: '2026-08-01', exercises: [{ name: 'Face Pull', sets: [{ reps: 12, weight: 10 }] }] },
    // Linked, under a name the library record has since dropped.
    { clientName: 'Asha', date: '2026-09-01', exercises: [{ name: 'Rope Face Pull', exerciseId: FACE, sets: [{ reps: 15, weight: 12.5 }] }] }
  ];

  it('the id finds history logged under an old name of the same record', () => {
    expect(findPreviousLoggedSetIn(history, 'Asha', { name: 'Cable Face Pull', exerciseId: FACE }, 0))
      .toEqual({ reps: 15, weight: 12.5 });
    expect(findPreviousExerciseSetsIn(history, 'Asha', { name: 'Cable Face Pull', exerciseId: FACE }))
      .toEqual([{ reps: 15, weight: 12.5 }]);
  });

  it('an entry without an id still resolves by name key', () => {
    expect(findPreviousLoggedSetIn(history, 'Asha', { name: 'Face Pulls' }, 0)).toEqual({ reps: 12, weight: 10 });
    expect(findPreviousLoggedSetIn(history, 'Asha', 'Face Pulls', 0)).toEqual({ reps: 12, weight: 10 });
  });

  it('an id with no linked history falls back to the name for old rows', () => {
    expect(findPreviousLoggedSetIn(history.slice(0, 1), 'Asha', { name: 'Face Pulls', exerciseId: FACE }, 0))
      .toEqual({ reps: 12, weight: 10 });
    // A different record's id doesn't hide a name match.
    expect(findPreviousLoggedSetIn(history, 'Asha', { name: 'Face Pull', exerciseId: CUSTOM }, 0))
      .toEqual({ reps: 12, weight: 10 });
  });

  it('neither id nor name matching gives null', () => {
    expect(findPreviousLoggedSetIn(history, 'Asha', { name: 'Leg Press', exerciseId: CUSTOM }, 0)).toBeNull();
    expect(findPreviousLoggedSetIn(history, 'Asha', { name: '' }, 0)).toBeNull();
  });

  it('fillPendingPrevSets hands the lookup the whole entry, id included', () => {
    const seen = [];
    const [ex] = fillPendingPrevSets(
      [{ name: 'Cable Face Pull', exerciseId: FACE, sets: [{ reps: '10', weight: '', isCompleted: false, prevPending: 'plan' }] }],
      (exercise, setIdx) => { seen.push(exercise.exerciseId); return findPreviousLoggedSetIn(history, 'Asha', exercise, setIdx); }
    );
    expect(seen).toEqual([FACE]);
    expect(ex.sets[0]).toMatchObject({ reps: 15, weight: '12.5' });
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
  it('never copies a warm-up move’s history: it starts as one default set', () => {
    const six = Array.from({ length: 6 }, () => ({ reps: 10, weight: 0 }));
    expect(setsFromPreviousExercise('Arm Circle', six)).toBeNull();
    expect(setsFromPreviousExercise('Leg Swing', six)).toBeNull();
  });
});
