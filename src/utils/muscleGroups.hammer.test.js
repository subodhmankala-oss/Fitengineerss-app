import { describe, it, expect } from 'vitest';
import { getMuscleGroupsForExercise, getMuscleWeight } from './muscleGroups';
import { getWeeklyMuscleStats } from './muscleAnalytics';

const set = exercise_name => ({ log_date: '2026-07-20', exercise_name, weight_kg: 10, reps: 10, set_type: null });
const setsOf = (logs, muscle) => getWeeklyMuscleStats(logs, '2026-07-20', '2026-07-26').find(s => s.muscle === muscle).sets;

describe('secondary muscle weighting', () => {
  it('curls credit Forearms: hammer more than a plain curl', () => {
    expect(getMuscleGroupsForExercise('Cross Body Hammer Curl')).toEqual(['Biceps', 'Forearms']);
    expect(getMuscleWeight('Cross Body Hammer Curl', 'Biceps')).toBe(1);
    expect(getMuscleWeight('Cross Body Hammer Curl', 'Forearms')).toBe(0.5);
    expect(getMuscleWeight('Barbell Curl', 'Forearms')).toBe(0.25);
    expect(getMuscleWeight('Wrist Curl', 'Forearms')).toBe(1);
    expect(getMuscleWeight('Barbell Curl', 'Chest')).toBe(0);
  });

  it('a secondary muscle gets half a set by default', () => {
    expect(getMuscleWeight('Bench Press', 'Chest')).toBe(1);
    expect(getMuscleWeight('Bench Press', 'Triceps')).toBe(0.5);
  });

  it('weekly set counts use the weights', () => {
    const logs = [set('Cross Body Hammer Curl'), set('Cross Body Hammer Curl'), set('Barbell Curl'), set('Bench Press')];
    expect(setsOf(logs, 'Biceps')).toBe(3);
    expect(setsOf(logs, 'Forearms')).toBe(1.25);
    expect(setsOf(logs, 'Chest')).toBe(1);
    expect(setsOf(logs, 'Triceps')).toBe(0.5);
  });
});
