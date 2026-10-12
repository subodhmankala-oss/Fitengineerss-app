import { describe, it, expect } from 'vitest';
import { getMuscleGroupsForExercise, getMuscleWeight, setCatalogMuscles } from './muscleGroups';
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

describe('landmine press', () => {
  it('credits Shoulders, then half a set of Chest instead of Triceps', () => {
    expect(getMuscleGroupsForExercise('Landmine Press')).toEqual(['Shoulders', 'Chest']);
    expect(getMuscleWeight('Landmine Press', 'Shoulders')).toBe(1);
    expect(getMuscleWeight('Landmine Press', 'Chest')).toBe(0.5);
    expect(getMuscleWeight('Landmine Press', 'Triceps')).toBe(0);
    expect(getMuscleGroupsForExercise('Shoulder Press')).toEqual(['Shoulders', 'Triceps']);
  });
});

describe('reverse hyperextension', () => {
  it('credits Glutes, then half a set of Back', () => {
    expect(getMuscleGroupsForExercise('Reverse Hyperextension')).toEqual(['Glutes', 'Back']);
    expect(getMuscleWeight('Reverse Hyperextension', 'Glutes')).toBe(1);
    expect(getMuscleWeight('Reverse Hyperextension', 'Back')).toBe(0.5);
    expect(getMuscleWeight('Reverse Hyperextension', 'Core')).toBe(0);
    expect(getMuscleGroupsForExercise('Back Extension')).toEqual(['Back', 'Glutes']);
    expect(getMuscleGroupsForExercise('Hyperextension')).toEqual(['Back', 'Glutes']);
  });
});

describe('exercise library audit fixes', () => {
  const groups = n => getMuscleGroupsForExercise(n);
  it('credits the muscles each move actually trains', () => {
    expect(groups('Chest-Supported Dumbbell')).toEqual(['Back', 'Biceps']);
    expect(groups('Cable Pull Through')).toEqual(['Glutes', 'Hamstrings']);
    expect(groups('Straight arm cable row(Rope)')).toEqual(['Back', 'Triceps']);
    expect(groups('Scapular Pull-up')).toEqual(['Back']);
    expect(groups('Squat Press')).toEqual(['Quads', 'Shoulders']);
    expect(groups('Close Grip Bench Press')).toEqual(['Triceps', 'Chest']);
    expect(groups('Superman')).toEqual(['Back', 'Glutes']);
    expect(groups('Seated Leg Curl  Machine')).toEqual(['Hamstrings', 'Calves']);
    expect(groups('Shoulder Taps')).toEqual(['Shoulders', 'Core']);
    // Unchanged neighbours of the rules above.
    expect(groups('Seated Cable Row')).toEqual(['Back', 'Biceps']);
    expect(groups('Barbell Squat')).toEqual(['Quads', 'Glutes']);
    expect(groups('Romanian Deadlift')).toEqual(['Hamstrings', 'Glutes']);
    expect(groups('Plank')).toEqual(['Core']);
  });

  it('distance cardio never falls back to its catalog text', () => {
    setCatalogMuscles([{ name: 'Running', category: 'Cardio', primary_muscle: 'Cardio', secondary_muscle: 'Legs, Core' }]);
    expect(groups('Running')).toEqual([]);
    expect(setsOf([set('Running')], 'Core')).toBe(0);
    setCatalogMuscles([]);
  });
});
