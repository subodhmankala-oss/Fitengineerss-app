import { describe, it, expect } from 'vitest';
import { exerciseTargetsMuscle } from './muscleGroups';

describe('exerciseTargetsMuscle', () => {
  it('matches the primary mover only', () => {
    expect(exerciseTargetsMuscle({ name: 'Flat Bench Press' }, 'Chest')).toBe(true);
    expect(exerciseTargetsMuscle({ name: 'Flat Bench Press' }, 'Triceps')).toBe(false);
    expect(exerciseTargetsMuscle({ name: 'Barbell Curl' }, 'Biceps')).toBe(true);
  });
  it('falls back to the catalog primary_muscle for unknown names', () => {
    expect(exerciseTargetsMuscle({ name: 'Zzz Mystery Move', primary_muscle: 'Calves' }, 'Calves')).toBe(true);
    expect(exerciseTargetsMuscle({ name: 'Zzz Mystery Move' }, 'Calves')).toBe(false);
  });
  it('matches everything when no muscle is picked', () => {
    expect(exerciseTargetsMuscle({ name: 'Anything' }, null)).toBe(true);
  });
});

describe('"lat" only as a whole word', () => {
  it('keeps Flat Bench Press on Chest and Lat Pulldown on Back', () => {
    expect(exerciseTargetsMuscle({ name: 'Flat Bench Press' }, 'Chest')).toBe(true);
    expect(exerciseTargetsMuscle({ name: 'Lat Pull Down' }, 'Back')).toBe(true);
    expect(exerciseTargetsMuscle({ name: 'Wide Grip Lat Pulldown' }, 'Back')).toBe(true);
  });
});
