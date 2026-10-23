import { describe, it, expect } from 'vitest';
import {
  exerciseNameKey, sameExercise, canonicalExerciseName, foldExerciseDashes,
  libraryExerciseId, exerciseIdField, sameExerciseEntry, findLibraryExercise, withExerciseIds
} from './exerciseName';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';

describe('exerciseNameKey', () => {
  it('treats real spelling variants from saved plans and logs as one exercise', () => {
    expect(sameExercise('Face Pulls', 'Face Pull')).toBe(true);
    expect(sameExercise('Pull‑Ups', 'Pull-up')).toBe(true);
    expect(sameExercise('Push-ups', 'Push Up')).toBe(true);
    expect(sameExercise('Lat pull-down', 'Lat Pull Down')).toBe(true);
    expect(sameExercise('Bent‑Over Barbell Row', 'Bent Over Barbell Row')).toBe(true);
    expect(sameExercise('Overhead Triceps Extension (Dumbbell)', 'Overhead Triceps Extension(Dumbbell)')).toBe(true);
    expect(sameExercise('Sumo squats', 'Sumo Squat')).toBe(true);
  });

  it('keeps qualified variants and different movements apart', () => {
    expect(sameExercise('Face Pull', 'Face Pull (Cable)')).toBe(false);
    expect(sameExercise('Leg Press', 'Leg Raise')).toBe(false);
    expect(sameExercise('', '')).toBe(false);
  });

  it('leaves -ss/-us/-is words alone', () => {
    expect(exerciseNameKey('Bench Press')).toBe('benchpress');
    expect(exerciseNameKey('Pallof Press')).toBe('pallofpress');
    expect(exerciseNameKey('Hammer Curls')).toBe('hammercurl');
  });

  // A key shared by two different static library names would make PREV or
  // the Form Guide pick the wrong exercise. Lat Pull Down / Lat Pulldown is
  // the one known true duplicate (see PICKER_HIDDEN_NAMES' comment).
  it('never merges two different static library exercises', () => {
    const sameMovement = new Set(['latpulldown']);
    const byKey = new Map();
    EXERCISE_LIBRARY.forEach(({ name }) => {
      const key = exerciseNameKey(name);
      const seen = byKey.get(key);
      if (seen && seen.toLowerCase() !== name.toLowerCase() && !sameMovement.has(key)) {
        throw new Error(`"${seen}" and "${name}" share the key "${key}"`);
      }
      byKey.set(key, name);
    });
  });
});

describe('canonicalExerciseName', () => {
  const library = ['Face Pull', 'Face Pull (Cable)', 'Pull-up', 'Bench Press'];

  it('swaps an AI-drafted spelling for the library name', () => {
    expect(canonicalExerciseName('Face Pulls', library)).toBe('Face Pull');
    expect(canonicalExerciseName('Pull‑Ups', library)).toBe('Pull-up');
    expect(canonicalExerciseName('bench press', library)).toBe('Bench Press');
  });

  it('keeps an unknown name, with its unicode dashes folded', () => {
    expect(canonicalExerciseName(' Assisted Pull‑Ups ', library)).toBe('Assisted Pull-Ups');
    expect(foldExerciseDashes('a–b')).toBe('a-b');
  });
});

describe('library ids', () => {
  const FACE = '11111111-1111-4111-8111-111111111111';
  const CUSTOM = '22222222-2222-4222-8222-222222222222';
  const library = [
    { id: FACE, name: 'Face Pull' },
    { id: '33333333-3333-4333-8333-333333333333', name: 'Pull-up' },
    { id: 'ex-12', name: 'Arm Circle' } // code-library entry: not a table row
  ];

  it('libraryExerciseId: only a real table row (uuid) has one', () => {
    expect(libraryExerciseId(library[0])).toBe(FACE);
    expect(libraryExerciseId(library[2])).toBeNull();
    expect(libraryExerciseId({ name: 'Plank' })).toBeNull();
    expect(libraryExerciseId(null)).toBeNull();
  });

  it('exerciseIdField: { exerciseId } for a uuid, {} for anything else', () => {
    expect(exerciseIdField(FACE)).toEqual({ exerciseId: FACE });
    expect(exerciseIdField(null)).toEqual({});
    // A forEach index or click event handed to an add handler.
    expect(exerciseIdField(1)).toEqual({});
    expect(exerciseIdField({ type: 'click' })).toEqual({});
  });

  describe('sameExerciseEntry', () => {
    it('the same id matches whatever either side is called now', () => {
      expect(sameExerciseEntry({ name: 'Cable Face Pull', exerciseId: FACE }, { name: 'Face Pull', exerciseId: FACE })).toBe(true);
    });
    it('falls back to the name key when either side has no id (old rows)', () => {
      expect(sameExerciseEntry({ name: 'Face Pulls', exerciseId: FACE }, { name: 'Face Pull' })).toBe(true);
      expect(sameExerciseEntry({ name: 'Face Pulls' }, 'Face Pull')).toBe(true);
      expect(sameExerciseEntry('Face Pull', { name: 'Leg Press', exerciseId: FACE })).toBe(false);
    });
    it('different ids still match by name (a custom copy of a catalog exercise)', () => {
      expect(sameExerciseEntry({ name: 'Face Pulls', exerciseId: CUSTOM }, { name: 'Face Pull', exerciseId: FACE })).toBe(true);
      expect(sameExerciseEntry({ name: 'Leg Press', exerciseId: CUSTOM }, { name: 'Face Pull', exerciseId: FACE })).toBe(false);
    });
  });

  it('findLibraryExercise: exact spelling first, then the name key', () => {
    expect(findLibraryExercise('face pull', library)).toBe(library[0]);
    expect(findLibraryExercise('Pull‑Ups', library)).toBe(library[1]);
    expect(findLibraryExercise('Deadlift', library)).toBeNull();
    expect(findLibraryExercise('', library)).toBeNull();
  });

  it('withExerciseIds fills only missing ids, from real table rows', () => {
    const exercises = [
      { name: 'Face Pulls', sets: [] },
      { name: 'Pull-up', exerciseId: CUSTOM, sets: [] },
      { name: 'Arm Circle', sets: [] },
      { name: 'Mystery Move', sets: [] }
    ];
    const out = withExerciseIds(exercises, library);
    expect(out[0]).toEqual({ name: 'Face Pulls', exerciseId: FACE, sets: [] });
    expect(out[1]).toBe(exercises[1]);
    expect(out[2]).toBe(exercises[2]);
    expect(out[3]).toBe(exercises[3]);
    const nothingToLink = [{ name: 'Mystery Move', sets: [] }];
    expect(withExerciseIds(nothingToLink, library)).toBe(nothingToLink);
    expect(withExerciseIds(exercises, [])).toBe(exercises);
  });
});
