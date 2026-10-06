import { describe, it, expect } from 'vitest';
import { searchLibrary, matchesLibraryQuery } from './librarySearch';

const entries = [
  { category: 'gym', level: 'beginner', muscles: ['Chest', 'Triceps'], workout: { name: 'Push Day', exercises: [{ name: 'Flat Bench Press' }, { name: 'Tricep Pushdown' }] } },
  { category: 'home', level: 'advanced', muscles: ['Core'], workout: { name: 'Bodyweight Burner', exercises: [{ name: 'Plank' }, { name: 'Push Up' }] } },
  { category: 'gym', level: 'intermediate', muscles: ['Quads'], workout: { name: 'Leg Day', exercises: [{ name: 'Squat' }] } },
];
const names = q => searchLibrary(entries, q).map(e => e.workout.name);

describe('librarySearch', () => {
  it('returns everything for an empty query', () => {
    expect(names('  ')).toHaveLength(3);
  });
  it('matches program name, exercise name and muscle', () => {
    expect(names('leg')).toEqual(['Leg Day']);
    expect(names('plank')).toEqual(['Bodyweight Burner']);
    expect(names('triceps')).toEqual(['Push Day']);
  });
  it('matches category and level words', () => {
    expect(names('home')).toEqual(['Bodyweight Burner']);
    expect(names('gym beginner')).toEqual(['Push Day']);
  });
  it('tolerates a one-letter typo', () => {
    expect(names('squt')).toEqual(['Leg Day']);
    expect(names('benhc press')).toEqual(['Push Day']); // swapped letters
    expect(names('bnhcx press')).toEqual([]); // too far off
    expect(names('bench pres')).toEqual(['Push Day']);
  });
  it('uses synonyms', () => {
    expect(names('abs')).toEqual(['Bodyweight Burner']);
    expect(names('legs')).toEqual(['Leg Day']);
  });
  it('requires every word to match', () => {
    expect(names('push squat')).toEqual([]);
  });
  it('matchesLibraryQuery handles missing fields', () => {
    expect(matchesLibraryQuery('x', undefined, null)).toBe(false);
  });
});

import { getProgramEquipment, filterByChips } from './librarySearch';

describe('chip filters', () => {
  it('derives equipment from exercise names', () => {
    expect([...getProgramEquipment([{ name: 'Dumbbell Curl' }, { name: 'Lat Pulldown' }])].sort()).toEqual(['dumbbell', 'machine']);
    expect([...getProgramEquipment([{ name: 'Push Up' }, { name: 'Plank' }])]).toEqual(['none']);
  });
  it('does not count dumbbell presses as barbell', () => {
    expect([...getProgramEquipment([{ name: 'Dumbbell Bench Press' }])]).toEqual(['dumbbell']);
  });
  it('filters by duration bucket and equipment', () => {
    const list = [
      { id: 1, estMinutes: 25, equipment: new Set(['none']) },
      { id: 2, estMinutes: 45, equipment: new Set(['dumbbell']) },
      { id: 3, estMinutes: 65, equipment: new Set(['barbell', 'machine']) },
    ];
    expect(filterByChips(list, { duration: 'short' }).map(e => e.id)).toEqual([1]);
    expect(filterByChips(list, { duration: 'medium' }).map(e => e.id)).toEqual([2]);
    expect(filterByChips(list, { duration: 'xl' }).map(e => e.id)).toEqual([3]);
    expect(filterByChips(list, { equipment: 'machine' }).map(e => e.id)).toEqual([3]);
    expect(filterByChips(list, { duration: 'short', equipment: 'dumbbell' })).toEqual([]);
    expect(filterByChips(list, {})).toHaveLength(3);
  });
});

describe('focus / level / place chips', () => {
  const list = [
    { id: 1, estMinutes: 30, equipment: new Set(['none']), focus: 'Push', level: 'beginner', category: 'home' },
    { id: 2, estMinutes: 30, equipment: new Set(['none']), focus: 'Legs', level: 'advanced', category: 'gym' },
  ];
  it('filters each and combines them', () => {
    expect(filterByChips(list, { focus: 'Legs' }).map(e => e.id)).toEqual([2]);
    expect(filterByChips(list, { level: 'beginner' }).map(e => e.id)).toEqual([1]);
    expect(filterByChips(list, { place: 'gym' }).map(e => e.id)).toEqual([2]);
    expect(filterByChips(list, { place: 'gym', level: 'beginner' })).toEqual([]);
  });
});
