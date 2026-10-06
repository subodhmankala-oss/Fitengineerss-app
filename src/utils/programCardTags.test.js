import { describe, it, expect } from 'vitest';
import { getProgramEquipment, getProgramTags, formatSets } from './programCardTags';

describe('getProgramEquipment', () => {
  it('lists equipment in a fixed order', () => {
    expect(getProgramEquipment([{ name: 'Lat Pull Down' }, { name: 'Dumbbell Curl' }, { name: 'Barbell Row' }]))
      .toEqual(['Dumbbells', 'Barbell', 'Machines']);
  });
  it('treats a dumbbell bench press as dumbbells only', () => {
    expect(getProgramEquipment([{ name: 'Dumbbell Bench Press' }])).toEqual(['Dumbbells']);
  });
  it('says No equipment for bodyweight work', () => {
    expect(getProgramEquipment([{ name: 'Push Up' }, { name: 'Plank' }])).toEqual(['No equipment']);
    expect(getProgramEquipment(undefined)).toEqual(['No equipment']);
  });
});

describe('getProgramTags', () => {
  it('estimates minutes from the set count', () => {
    const ex = Array.from({ length: 4 }, () => ({ name: 'Squat', sets: [{}, {}, {}] }));
    // 12 sets x 2.5 min = 30
    expect(getProgramTags(ex, 'Legs').minutes).toBe(30);
  });
});

describe('formatSets', () => {
  it('formats equal reps, varied reps and missing reps', () => {
    expect(formatSets([{ reps: 10 }, { reps: '10' }, { reps: 10 }])).toBe('3 sets × 10');
    expect(formatSets([{ reps: 12 }, { reps: 10 }, { reps: 8 }])).toBe('3 sets · 12/10/8');
    expect(formatSets([{ reps: '' }, {}])).toBe('2 sets');
    expect(formatSets([{ reps: 5 }])).toBe('1 set × 5');
    expect(formatSets([])).toBe('');
  });
});
