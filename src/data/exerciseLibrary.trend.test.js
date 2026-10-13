import { describe, it, expect } from 'vitest';
import { inferCategory, inferPrimary, isLoadedCarryExercise, isTimedExercise, isBodyweightExercise, isCardioExercise } from './exerciseLibrary';
import { getMuscleGroupsForExercise } from '../utils/muscleGroups';

// Sled Push, Wall Ball and Hundred arrived with the Hyrox and Pilates
// programs — each has to land in the right logger shape and muscle group.
describe('Hyrox and Pilates exercises', () => {
  it('Sled Push is a leg move logged as weight + metres, like Farmer Walk', () => {
    expect(inferCategory('Sled Push')).toBe('Legs');
    expect(inferPrimary('Sled Push')).toBe('Quadriceps');
    expect(isLoadedCarryExercise('Sled Push')).toBe(true);
    expect(isLoadedCarryExercise('Sled Pull')).toBe(true);
    expect(isCardioExercise('Sled Push')).toBe(false);
    expect(getMuscleGroupsForExercise('Sled Push')).toEqual(expect.arrayContaining(['Quads', 'Glutes']));
  });

  it('Wall Ball is a normal weight + reps move for quads and shoulders', () => {
    expect(isLoadedCarryExercise('Wall Ball')).toBe(false);
    expect(isTimedExercise('Wall Ball')).toBe(false);
    expect(getMuscleGroupsForExercise('Wall Ball')).toEqual(expect.arrayContaining(['Quads', 'Shoulders']));
  });

  it('SkiErg is timed like Air Rowing, not km + time', () => {
    expect(inferCategory('SkiErg')).toBe('Cardio');
    expect(isCardioExercise('SkiErg')).toBe(false);
    expect(isTimedExercise('SkiErg')).toBe(true);
    expect(isBodyweightExercise('SkiErg')).toBe(false);
  });

  it('Sandbag Lunge is kg + metres; Burpee Broad Jump is bodyweight reps', () => {
    expect(isLoadedCarryExercise('Sandbag Lunge')).toBe(true);
    expect(inferCategory('Sandbag Lunge')).toBe('Legs');
    expect(getMuscleGroupsForExercise('Sandbag Lunge')).toEqual(expect.arrayContaining(['Quads']));
    expect(isBodyweightExercise('Burpee Broad Jump')).toBe(true);
    expect(isTimedExercise('Burpee Broad Jump')).toBe(false);
    expect(getMuscleGroupsForExercise('Burpee Broad Jump')).toEqual(['Core', 'Quads']);
  });

  it('Hundred is a timed bodyweight core move', () => {
    expect(inferCategory('Hundred')).toBe('Core');
    expect(inferPrimary('Hundred')).toBe('Core / Abs');
    expect(isTimedExercise('Hundred')).toBe(true);
    expect(isBodyweightExercise('Hundred')).toBe(true);
    expect(getMuscleGroupsForExercise('Hundred')).toEqual(['Core']);
  });
});
