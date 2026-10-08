import { describe, it, expect } from 'vitest';
import { getMuscleGroupsForExercise, parseMuscleText, setCatalogMuscles } from './muscleGroups';

describe('catalog primary-muscle fallback', () => {
  it('maps free text onto the existing 12 groups', () => {
    expect(parseMuscleText('Lower Trapezius, Latissimus Dorsi')).toEqual(['Back']);
    expect(parseMuscleText('Rear Delts / Rhomboids')).toEqual(['Shoulders', 'Back']);
    expect(parseMuscleText('Teres Major, Teres Minor, Infraspinatus')).toEqual(['Back']);
  });

  it('only applies when no name rule matches; credits primary + first different secondary', () => {
    expect(getMuscleGroupsForExercise('Zz Scap Thing')).toEqual([]);
    setCatalogMuscles([
      { name: 'Zz Scap Thing', category: 'Back', primary_muscle: 'Lower Trapezius, Latissimus Dorsi', secondary_muscle: 'Rhomboids, Forearms' },
      { name: 'Shrug', category: 'Back', primary_muscle: 'Lower Trapezius', secondary_muscle: '' }
    ]);
    expect(getMuscleGroupsForExercise('zz scap thing')).toEqual(['Back', 'Forearms']);
    // Name rule still wins: Shrug keeps its existing credit.
    expect(getMuscleGroupsForExercise('Shrug')).toEqual(['Shoulders', 'Back']);
    setCatalogMuscles([]);
    expect(getMuscleGroupsForExercise('Zz Scap Thing')).toEqual([]);
  });
});
