import { describe, it, expect } from 'vitest';
import { EXERCISE_SUBGROUPS, getExerciseSubgroups, exerciseInSubgroup, subgroupSearchText } from './exerciseSubgroups';
import { EXERCISE_LIBRARY, inferCategory, inferPrimary } from './exerciseLibrary';
import { getMuscleGroupsForExercise } from '../utils/muscleGroups';

const inSg = (name, sg) => exerciseInSubgroup(name, sg);

describe('exercise sub-groups', () => {
  it('splits chest into upper / mid / lower', () => {
    expect(getExerciseSubgroups('Incline Dumbbell Press')).toContain('Upper Chest');
    expect(getExerciseSubgroups('Low to high cable fly')).toContain('Upper Chest');
    expect(getExerciseSubgroups('Bench Press (Barbell)')).toEqual(['Mid Chest']);
    expect(getExerciseSubgroups('Decline Bench Press')).toContain('Lower Chest');
    expect(getExerciseSubgroups('Chest Dip')).toContain('Lower Chest');
    // Hands-elevated push-up is a decline angle for the chest, and vice versa.
    expect(inSg('Incline Push-up', 'Lower Chest')).toBe(true);
    expect(inSg('Decline Push-up', 'Upper Chest')).toBe(true);
  });

  it('splits back into lats / upper / mid (rhomboids) / lower', () => {
    expect(inSg('Lat Pulldown', 'Lats')).toBe(true);
    expect(inSg('Pull-up', 'Lats')).toBe(true);
    expect(inSg('Shrug (Dumbbell)', 'Upper Back')).toBe(true);
    expect(inSg('Seated Cable Row', 'Mid Back')).toBe(true);
    expect(inSg('Wide-Grip Seated Row', 'Mid Back')).toBe(true);
    expect(inSg('One Arm Dumbbell Row', 'Lats')).toBe(true);
    expect(inSg('One Arm Dumbbell Row', 'Mid Back')).toBe(true);
    expect(inSg('Back Extension', 'Lower Back')).toBe(true);
    expect(inSg('Upright Row', 'Mid Back')).toBe(false);
  });

  it('splits biceps and triceps by head', () => {
    expect(inSg('Incline Dumbbell Curl', 'Biceps Long Head')).toBe(true);
    expect(inSg('Incline Dumbbell Curl', 'Biceps Short Head')).toBe(false);
    expect(inSg('Preacher Curl', 'Biceps Short Head')).toBe(true);
    expect(inSg('Preacher Curl', 'Biceps Long Head')).toBe(false);
    expect(inSg('Barbell Curl', 'Biceps Long Head') && inSg('Barbell Curl', 'Biceps Short Head')).toBe(true);
    expect(inSg('Overhead Triceps Extension', 'Triceps Long Head')).toBe(true);
    expect(inSg('Overhead Triceps Extension', 'Triceps Lateral Head')).toBe(false);
    expect(inSg('Triceps Rope Pushdown', 'Triceps Lateral Head')).toBe(true);
    expect(inSg('Leg Curl (Lying)', 'Biceps Short Head')).toBe(false);
  });

  it('splits abs into upper / lower / obliques', () => {
    expect(inSg('Crunch', 'Upper Abs')).toBe(true);
    expect(inSg('Reverse Crunch', 'Lower Abs')).toBe(true);
    expect(inSg('Reverse Crunch', 'Upper Abs')).toBe(false);
    expect(inSg('Hanging Leg Raises', 'Lower Abs')).toBe(true);
    expect(inSg('Russian Twist', 'Obliques')).toBe(true);
    expect(inSg('Bicycle Crunch', 'Obliques')).toBe(true);
  });

  it('has tibialis exercises', () => {
    const tib = EXERCISE_LIBRARY.filter(e => inSg(e.name, 'Tibialis'));
    expect(tib.length).toBeGreaterThanOrEqual(3);
    tib.forEach(e => expect(e.category).toBe('Legs'));
  });

  it('every sub-group has exercises in the static library', () => {
    Object.values(EXERCISE_SUBGROUPS).flat().forEach(sg => {
      expect(EXERCISE_LIBRARY.some(e => inSg(e.name, sg.id)), sg.id).toBe(true);
    });
  });

  it('search text covers inner muscle names', () => {
    expect(subgroupSearchText('Seated Cable Row')).toContain('rhomboids');
    expect(subgroupSearchText('Tibialis Raise')).toContain('shin');
  });
});

describe('classifier fixes', () => {
  it('leg / nordic curls are hamstring moves, not arms', () => {
    expect(inferCategory('Leg Curl (Lying)')).toBe('Legs');
    expect(inferPrimary('Leg Curl (Lying)')).toBe('Hamstrings');
    expect(getMuscleGroupsForExercise('Nordic Hamstring Curl')[0]).toBe('Hamstrings');
  });

  it('glute kickback and close-grip pulldown are not triceps', () => {
    expect(getMuscleGroupsForExercise('Glute Kickback')).toEqual(['Glutes']);
    expect(inferCategory('Glute Kickback')).toBe('Legs');
    expect(getMuscleGroupsForExercise('Lat Pulldown (Close Grip)')[0]).toBe('Back');
  });
});
