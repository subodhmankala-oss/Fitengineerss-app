import { describe, it, expect } from 'vitest';
import { buildAiCatalog, matchCatalogExercise, swapAlternatives, formatCatalogForPrompt } from './aiWorkoutCatalog';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';

const catalog = buildAiCatalog({ staticLibrary: EXERCISE_LIBRARY });

describe('buildAiCatalog', () => {
  it('drops warm-ups, hidden names and duplicates, DB rows win', () => {
    const c = buildAiCatalog({
      dbExercises: [{ id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Face Pull', category: 'Shoulders', primary_muscle: 'Rear Delts' }],
      staticLibrary: [{ name: 'Face Pulls', category: 'Shoulders', primary: 'Rear Delts' }, { name: 'Arm Circles', category: 'Warm Up' }, { name: 'Bench Press', category: 'Chest' }],
      hidden: new Set(['bench press'])
    });
    expect(c.map(e => e.name)).toEqual(['Face Pull']);
    expect(c[0].id).toBeTruthy();
  });

  it('has no warm-up exercises from the real library', () => {
    expect(catalog.some(e => e.category === 'Warm Up')).toBe(false);
    expect(catalog.length).toBeGreaterThan(150);
  });
});

describe('matchCatalogExercise', () => {
  const lib = [
    { name: 'Face Pull', muscle: 'Rear Delts' },
    { name: 'Cable Fly', muscle: 'Chest' },
    { name: 'Seated Cable Row', muscle: 'Back / Lats' },
    { name: 'Bench Press (Barbell)', muscle: 'Chest' }
  ];

  it('matches spelling variants exactly', () => {
    expect(matchCatalogExercise('Face Pulls', lib)?.name).toBe('Face Pull');
    expect(matchCatalogExercise('bench press (barbell)', lib)?.name).toBe('Bench Press (Barbell)');
  });

  it('matches near names by movement words', () => {
    expect(matchCatalogExercise('Cable Face Pull', lib)?.name).toBe('Face Pull');
    expect(matchCatalogExercise('Barbell Bench Press', lib)?.name).toBe('Bench Press (Barbell)');
  });

  it('does not match on a shared equipment word alone', () => {
    expect(matchCatalogExercise('Cable Crunch', lib)).toBeNull();
    expect(matchCatalogExercise('Bulgarian Split Squat', lib)).toBeNull();
  });
});

describe('swapAlternatives', () => {
  it('offers same-muscle exercises, never the exercise itself or ones in the day', () => {
    const chest = catalog.find(e => e.muscle === 'Chest');
    const alts = swapAlternatives(chest.name, catalog, { exclude: [] });
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every(a => a.name !== chest.name)).toBe(true);
    expect(alts[0].muscle).toBe('Chest');
    const excluded = swapAlternatives(chest.name, catalog, { exclude: [alts[0].name] });
    expect(excluded.some(a => a.name === alts[0].name)).toBe(false);
  });
});

describe('formatCatalogForPrompt', () => {
  it('groups names by muscle, one line each', () => {
    const text = formatCatalogForPrompt([{ name: 'A', muscle: 'Chest' }, { name: 'B', muscle: 'Chest' }, { name: 'C', muscle: 'Back' }]);
    expect(text).toBe('Back: C\nChest: A; B');
  });
});
