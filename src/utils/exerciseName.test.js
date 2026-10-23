import { describe, it, expect } from 'vitest';
import { exerciseNameKey, sameExercise, canonicalExerciseName, foldExerciseDashes } from './exerciseName';
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
