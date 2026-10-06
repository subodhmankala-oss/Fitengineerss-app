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
