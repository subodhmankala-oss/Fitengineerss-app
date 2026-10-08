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

describe('Rotator cuff is part of Back', () => {
  it('rotator-cuff exercises credit Back; Back suggests one', async () => {
    expect(getMuscleGroupsForExercise('External Rotation (Cable)')).toEqual(['Back']);
    expect(getMuscleGroupsForExercise('Rotator calf')).toEqual(['Back']);
    expect(getMuscleGroupsForExercise('Face Pull')).toEqual(['Shoulders', 'Back']);
    const { RECOMMENDED_EXERCISES } = await import('./muscleAnalytics');
    expect(RECOMMENDED_EXERCISES.Back).toContain('External Rotation (Cable)');
  });

  it('the Back breakdown gives each region its own status', async () => {
    const { getRegionBreakdownForMuscle, regionBand } = await import('./muscleRegions');
    expect(regionBand('Back')).toEqual({ min: 2, max: 4, target: 3 });
    const set = (name, n) => Array.from({ length: n }, () => ({ exercise_name: name, log_date: '2026-10-06', weight_kg: 10, reps: 10 }));
    const logs = [...set('External Rotation (Cable)', 3), ...set('Lat Pulldown', 1), ...set('Barbell Row', 6)];
    const rows = Object.fromEntries(getRegionBreakdownForMuscle(logs, 'Back', '2026-10-01', '2026-10-07').map(r => [r.id, r]));
    expect(rows['Rotator Cuff'].sets).toBe(3);
    expect(rows['Rotator Cuff'].tier.label).toBe('Optimal');
    expect(rows.Lats.tier.label).toBe('Low');
    expect(rows['Mid Back'].tier.label).toBe('Very High');
    expect(rows['Lower Back'].tier.label).toBe('Not Trained');
    expect(rows['Lower Back'].suggestions.length).toBeGreaterThan(0);
  });
});
