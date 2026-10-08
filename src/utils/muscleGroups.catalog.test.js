import { describe, it, expect } from 'vitest';
import { getMuscleGroupsForExercise, parseMuscleText, setCatalogMuscles } from './muscleGroups';

describe('catalog primary-muscle fallback', () => {
  it('maps free text onto the existing 12 groups', () => {
    expect(parseMuscleText('Lower Trapezius, Latissimus Dorsi')).toEqual(['Back']);
    expect(parseMuscleText('Rear Delts / Rhomboids')).toEqual(['Shoulders', 'Back']);
    expect(parseMuscleText('Teres Major, Teres Minor, Infraspinatus')).toEqual(['Rotator Cuff']);
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

describe('Rotator Cuff group', () => {
  it('rotator-cuff exercises credit Rotator Cuff, not Shoulders or Back', async () => {
    expect(getMuscleGroupsForExercise('External Rotation (Cable)')).toEqual(['Rotator Cuff']);
    expect(getMuscleGroupsForExercise('Rotator calf')).toEqual(['Rotator Cuff']);
    // Face Pull keeps its existing credit.
    expect(getMuscleGroupsForExercise('Face Pull')).toEqual(['Shoulders', 'Back']);
    const { RECOMMENDED_EXERCISES, getWeeklyMuscleStats } = await import('./muscleAnalytics');
    RECOMMENDED_EXERCISES['Rotator Cuff'].forEach(n => expect(getMuscleGroupsForExercise(n)).toEqual(['Rotator Cuff']));
    // Optional like Tibialis: no card until it's trained.
    expect(getWeeklyMuscleStats([], '2026-10-01', '2026-10-07').some(s => s.muscle === 'Rotator Cuff')).toBe(false);
  });
});
