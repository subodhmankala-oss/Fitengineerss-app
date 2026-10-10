import { describe, it, expect } from 'vitest';
import { getMuscleGroupsForExercise } from './muscleGroups';

describe('hammer curls', () => {
  it('credit Biceps and Forearms; plain curls stay Biceps only', () => {
    expect(getMuscleGroupsForExercise('Cross Body Hammer Curl')).toEqual(['Biceps', 'Forearms']);
    expect(getMuscleGroupsForExercise('Dumbbell Hammer Curl')).toEqual(['Biceps', 'Forearms']);
    expect(getMuscleGroupsForExercise('Barbell Curl')).toEqual(['Biceps']);
  });
});
