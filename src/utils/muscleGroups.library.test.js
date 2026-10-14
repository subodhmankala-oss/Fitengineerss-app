import { describe, it, expect } from 'vitest';
import { getMuscleGroupsForExercise as g, getMuscleWeight } from './muscleGroups';

// Primary / secondary muscles for exercises the Workout Library programs use.
describe('library exercise muscles', () => {
  it.each([
    ['Cable Fly', ['Chest']],
    ['Cable Crossover', ['Chest']],
    ['Pec Deck Fly', ['Chest']],
    ['Bench Press', ['Chest', 'Triceps']],
    ['Push-up', ['Chest', 'Triceps']],
    ['Barbell Shrug', ['Back', 'Forearms']],
    ['Kettlebell Swing', ['Glutes', 'Hamstrings']],
    ['Sumo Deadlift', ['Glutes', 'Hamstrings']],
    ['Deadlift', ['Hamstrings', 'Back']],
    ['Sled Pull', ['Back', 'Biceps']],
    ['Sled Push', ['Quads', 'Glutes']],
    ['Jumping Jack', ['Calves', 'Shoulders']],
    ['Air Rowing', ['Back', 'Quads']],
    ['Barbell Row', ['Back', 'Biceps']],
    ['Rear Delt Fly (Cable)', ['Shoulders', 'Back']]
  ])('%s', (name, expected) => {
    expect(g(name)).toEqual(expected);
  });

  it('shrug forearm credit is a quarter set', () => {
    expect(getMuscleWeight('Barbell Shrug', 'Back')).toBe(1);
    expect(getMuscleWeight('Barbell Shrug', 'Forearms')).toBe(0.25);
  });
});
