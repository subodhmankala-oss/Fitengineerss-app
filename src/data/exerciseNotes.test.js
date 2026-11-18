import { describe, it, expect } from 'vitest';
import { getExerciseNote, EXERCISE_NOTE_COUNT } from './exerciseNotes';

describe('written exercise notes', () => {
  it('covers the whole library', () => {
    expect(EXERCISE_NOTE_COUNT).toBeGreaterThanOrEqual(320);
  });
  it('finds notes across spelling and equipment variants', () => {
    expect(getExerciseNote('Lat Pull Down')).toMatch(/collarbone/);
    expect(getExerciseNote('Lat Pulldown')).toMatch(/collarbone/);
    expect(getExerciseNote('Incline Dumbbell Press')).toMatch(/45°/);
    expect(getExerciseNote('Bench Press (Barbell)')).toBeTruthy();
  });
  it('returns empty for an unknown or custom exercise', () => {
    expect(getExerciseNote('My Made Up Move')).toBe('');
    expect(getExerciseNote('')).toBe('');
  });
});
