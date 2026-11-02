import { describe, it, expect } from 'vitest';
import { getRegionBreakdownForMuscle } from './muscleRegions';
import { getMuscleWeight } from './muscleGroups';
import { inferCategory, inferPrimary, isCardioExercise, isBodyweightExercise } from '../data/exerciseLibrary';

const NEW = ['Cable Hip Abduction', 'Seated Band Abduction', 'Clamshell', 'Lateral Band Walk', 'Monster Walk', 'Side-Lying Leg Raise', 'Hip Hike'];

describe('Glute Med exercises', () => {
  it('each is a full Glutes set, a Legs move with Glutes as primary, never cardio', () => {
    NEW.forEach(name => {
      expect(getMuscleWeight(name, 'Glutes')).toBe(1);
      expect(getMuscleWeight(name, 'Core')).toBe(0);
      expect(inferCategory(name)).toBe('Legs');
      expect(inferPrimary(name)).toBe('Glutes');
      expect(isCardioExercise(name)).toBe(false);
    });
  });

  it('band / bodyweight ones get the Bodyweight toggle; cable stays loaded', () => {
    ['Seated Band Abduction', 'Clamshell', 'Lateral Band Walk', 'Monster Walk', 'Side-Lying Leg Raise', 'Hip Hike']
      .forEach(name => expect(isBodyweightExercise(name)).toBe(true));
    expect(isBodyweightExercise('Cable Hip Abduction')).toBe(false);
  });

  it('the Glute Med card suggests more than the abduction machine', () => {
    const med = getRegionBreakdownForMuscle([], 'Glutes', '2026-11-01', '2026-11-07').find(r => r.id === 'Glute Med');
    expect(med.suggestions.length).toBe(3);
    med.suggestions.forEach(name => expect(getMuscleWeight(name, 'Glutes')).toBe(1));
  });
});
