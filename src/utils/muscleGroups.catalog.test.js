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
    // Untrained this week: when it was last worked instead.
    expect(rows['Lower Back'].lastTrained).toBeNull();
    const older = [...logs, { exercise_name: 'Back Extension', log_date: '2026-09-25', weight_kg: 0, reps: 12 }];
    const rows2 = Object.fromEntries(getRegionBreakdownForMuscle(older, 'Back', '2026-10-01', '2026-10-07').map(r => [r.id, r]));
    expect(rows2['Lower Back'].sets).toBe(0);
    expect(rows2['Lower Back'].lastTrained).toEqual({ date: '2026-09-25', exercise: 'Back Extension' });
  });
});

describe('Every muscle but Tibialis has an "Inside" breakdown', () => {
  const set = (name, n) => Array.from({ length: n }, () => ({ exercise_name: name, log_date: '2026-10-06', weight_kg: 10, reps: 10 }));

  it('each region has a body icon and a plain explanation', async () => {
    const { getRegionBreakdownForMuscle, hasRegions, REGION_PLAIN } = await import('./muscleRegions');
    const { REGION_SHAPES } = await import('../components/MuscleAnalytics/regionShapes');
    const { MUSCLE_GROUPS } = await import('./muscleGroups');
    MUSCLE_GROUPS.forEach(m => {
      expect(hasRegions(m)).toBe(m !== 'Tibialis');
      getRegionBreakdownForMuscle([], m, '2026-10-01', '2026-10-07').forEach(r => {
        expect(REGION_SHAPES[r.id], r.id).toBeTruthy();
        expect(REGION_PLAIN[r.id], r.id).toBeTruthy();
        expect(r.suggestions.length, r.id).toBeGreaterThan(0);
      });
    });
  });

  it('single-chip muscles split by movement, with no "Other" row', async () => {
    const { getRegionBreakdownForMuscle } = await import('./muscleRegions');
    const rows = (logs, m) => Object.fromEntries(getRegionBreakdownForMuscle(logs, m, '2026-10-01', '2026-10-07').map(r => [r.id, r.sets]));
    expect(rows([...set('Hip Thrust', 4), ...set('Hip Abduction (Machine)', 2)], 'Glutes')).toEqual({ 'Glute Max': 4, 'Glute Med': 2 });
    expect(rows([...set('Calf Raise (Standing)', 3), ...set('Seated Calf Raise', 3)], 'Calves')).toEqual({ Gastrocnemius: 3, Soleus: 3 });
    expect(rows([...set('Romanian Deadlift', 3), ...set('Leg Curl (Lying)', 2)], 'Hamstrings')).toEqual({ 'Outer Hamstring': 3, 'Inner Hamstrings': 2 });
    expect(rows([...set('Barbell Squat', 4), ...set('Leg Extension', 2)], 'Quads')).toEqual({ 'Rectus Femoris': 2, 'Vastus Muscles': 4 });
  });

  it('a set that works both heads is shared between them', async () => {
    const { getRegionBreakdownForMuscle } = await import('./muscleRegions');
    const rows = Object.fromEntries(getRegionBreakdownForMuscle([...set('Barbell Curl', 3), ...set('Preacher Curl', 2)], 'Biceps', '2026-10-01', '2026-10-07').map(r => [r.id, r]));
    expect(rows['Biceps Long Head'].sets).toBe(1.5);
    expect(rows['Biceps Short Head'].sets).toBe(3.5);
    expect(rows['Biceps Long Head'].exercises).toEqual([{ name: 'Barbell Curl', sets: 3 }]);
  });
});

describe('Log Sets "Behind this week" gaps', () => {
  it('lists untrained parts first, each with one exercise to add', async () => {
    const { getMuscleGaps } = await import('./muscleRegions');
    const set = (name, n, date = '2026-10-06') => Array.from({ length: n }, () => ({ exercise_name: name, log_date: date }));
    const logs = [...set('Barbell Row', 3), ...set('Lat Pulldown', 1), ...set('Bench Press', 5)];
    const gaps = getMuscleGaps(logs, '2026-10-07');
    const labels = gaps.map(g => g.label);
    expect(labels).toContain('Lower Back');
    expect(labels).not.toContain('Mid Back'); // 3 sets: in range
    expect(labels).not.toContain('Mid Chest'); // 5 sets: in range
    const firstTrained = gaps.findIndex(g => g.sets > 0);
    expect(gaps.slice(firstTrained).every(g => g.sets > 0)).toBe(true);
    expect(gaps.find(g => g.label === 'Lats')).toMatchObject({ sets: 1, min: 2 });
    gaps.forEach(g => expect(typeof g.suggestion).toBe('string'));
    const names = gaps.map(g => g.suggestion.toLowerCase());
    expect(new Set(names).size).toBe(names.length); // no exercise suggested twice
  });
});
