import { describe, it, expect } from 'vitest';
import { flattenLibrary, getRecentlyUsed, toggleFavoriteId, getFavorites } from './librarySections';

const library = {
  gym: { beginner: [{ id: 'a', name: 'Push Day' }, { id: 'b', name: 'Pull Day' }], intermediate: [{ id: 'c', name: 'Leg Day' }] },
  home: { beginner: [{ id: 'd', name: 'Home Core' }] },
};
const entries = flattenLibrary(library);

describe('flattenLibrary', () => {
  it('lists every program with its category and level', () => {
    expect(entries.map(e => [e.category, e.level, e.workout.id])).toEqual([
      ['gym', 'beginner', 'a'], ['gym', 'beginner', 'b'], ['gym', 'intermediate', 'c'], ['home', 'beginner', 'd'],
    ]);
  });
  it('copes with a missing library', () => {
    expect(flattenLibrary(null)).toEqual([]);
  });
});

describe('getRecentlyUsed', () => {
  const sessions = [
    { date: '2026-10-01', planName: 'Push Day' },
    { date: '2026-10-05', planName: 'leg day ' },
    { date: '2026-10-03', planName: 'My Own Template' },
    { date: '2026-10-04', planName: 'Push Day' },
    { date: '2026-10-02', planName: 'Home Core' },
  ];
  it('returns library programs, newest first, no repeats, ignoring non-library plans', () => {
    expect(getRecentlyUsed(entries, sessions).map(e => e.workout.id)).toEqual(['c', 'a', 'd']);
  });
  it('respects the max', () => {
    expect(getRecentlyUsed(entries, sessions, 1).map(e => e.workout.id)).toEqual(['c']);
  });
  it('is empty with no sessions', () => {
    expect(getRecentlyUsed(entries, [])).toEqual([]);
  });
});

describe('favorites', () => {
  it('toggles an id on and off', () => {
    expect(toggleFavoriteId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleFavoriteId(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('keeps starred order and drops ids no longer in the library', () => {
    expect(getFavorites(entries, ['d', 'gone', 'a']).map(e => e.workout.id)).toEqual(['d', 'a']);
  });
});
