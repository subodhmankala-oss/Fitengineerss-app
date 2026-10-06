import { describe, it, expect } from 'vitest';
import { getProgramEquipment, filterByChips, filterOrClosest, enrichLibraryEntry } from './libraryFilters';

describe('getProgramEquipment', () => {
  it('derives equipment from exercise names', () => {
    expect([...getProgramEquipment([{ name: 'Dumbbell Curl' }, { name: 'Lat Pulldown' }])].sort()).toEqual(['dumbbell', 'machine']);
    expect([...getProgramEquipment([{ name: 'Push Up' }, { name: 'Plank' }])]).toEqual(['none']);
  });
  it('does not count dumbbell presses as barbell', () => {
    expect([...getProgramEquipment([{ name: 'Dumbbell Bench Press' }])]).toEqual(['dumbbell']);
  });
});

describe('filterByChips', () => {
  const list = [
    { id: 1, estMinutes: 25, equipment: new Set(['none']), focus: 'Core' },
    { id: 2, estMinutes: 45, equipment: new Set(['dumbbell']), focus: 'Push' },
    { id: 3, estMinutes: 65, equipment: new Set(['barbell', 'machine']), focus: 'Legs' },
  ];
  const ids = f => filterByChips(list, f).map(e => e.id);

  it('filters by each dropdown', () => {
    expect(ids({ duration: 'short' })).toEqual([1]);
    expect(ids({ duration: 'medium' })).toEqual([2]);
    expect(ids({ duration: 'xl' })).toEqual([3]);
    expect(ids({ equipment: 'machine' })).toEqual([3]);
    expect(ids({ focus: 'Push' })).toEqual([2]);
  });
  it('combines dropdowns, and empty means everything', () => {
    expect(ids({ duration: 'short', equipment: 'dumbbell' })).toEqual([]);
    expect(ids({ focus: 'Legs', equipment: 'barbell' })).toEqual([3]);
    expect(ids({})).toEqual([1, 2, 3]);
  });
});

describe('filterOrClosest', () => {
  const list = [
    { id: 1, estMinutes: 25, equipment: new Set(['none']), focus: 'Core' },
    { id: 2, estMinutes: 45, equipment: new Set(['dumbbell']), focus: 'Push' },
    { id: 3, estMinutes: 65, equipment: new Set(['barbell', 'machine']), focus: 'Legs' },
  ];
  it('returns exact matches when there are any', () => {
    expect(filterOrClosest(list, { focus: 'Push' })).toEqual({ results: [list[1]], closest: false });
  });
  it('is never empty: falls back to the closest programs, best first', () => {
    // Pull + dumbbells matches nothing exactly; #2 has dumbbells (1 of 2).
    const r = filterOrClosest(list, { focus: 'Pull', equipment: 'dumbbell' });
    expect(r.closest).toBe(true);
    expect(r.results.map(e => e.id)).toEqual([2, 1, 3]);
  });
  it('uses time distance to break ties', () => {
    // Nothing is Pull; 60+ min -> #3 (65) closest, then #2 (45), then #1.
    expect(filterOrClosest(list, { focus: 'Pull', duration: 'xl' }).results.map(e => e.id)).toEqual([3, 2, 1]);
  });
  it('stays empty only when there are no programs at all', () => {
    expect(filterOrClosest([], { focus: 'Pull' })).toEqual({ results: [], closest: false });
  });
});

describe('enrichLibraryEntry', () => {
  it('handles a program with no exercises', () => {
    const e = enrichLibraryEntry({ id: 'x', name: 'Empty' }, 'gym', 'beginner');
    expect(e).toMatchObject({ category: 'gym', level: 'beginner' });
    expect([...e.equipment]).toEqual(['none']);
  });
});
