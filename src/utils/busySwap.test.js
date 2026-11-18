import { describe, it, expect } from 'vitest';
import { busyAlternative, isStationExercise } from './busySwap';

const ID = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const catalog = [
  { id: ID(1), name: 'Chest Press (Machine)', muscle: 'Chest', category: 'Chest' },
  { id: ID(2), name: 'Bench Press (Dumbbell)', muscle: 'Chest', category: 'Chest' },
  { id: ID(3), name: 'Cable Fly', muscle: 'Chest', category: 'Chest' },
  { id: ID(4), name: 'Push Up', muscle: 'Chest', category: 'Chest' },
  { id: ID(5), name: 'Barbell Curl', muscle: 'Biceps', category: 'Arms' }
];

describe('Busy? swap', () => {
  it('only machine and cable stations get one', () => {
    expect(isStationExercise('Chest Press (Machine)')).toBe(true);
    expect(isStationExercise('Cable Fly')).toBe(true);
    expect(isStationExercise('Lat Pull Down')).toBe(true);
    expect(isStationExercise('Bench Press (Dumbbell)')).toBe(false);
    expect(busyAlternative('Push Up', catalog)).toBeNull();
  });
  it('suggests a free-weight or bodyweight stand-in, never another station', () => {
    const alt = busyAlternative('Chest Press (Machine)', catalog);
    expect(alt).toBeTruthy();
    expect(isStationExercise(alt.name)).toBe(false);
    expect(alt.match).toBeGreaterThanOrEqual(60);
    expect(alt.exerciseId).toBeTruthy();
  });
  it('dumbbell exercises get a stand-in that needs no dumbbells', () => {
    const alt = busyAlternative('Bench Press (Dumbbell)', catalog);
    expect(alt).toBeTruthy();
    expect(alt.name).not.toMatch(/dumbbell/i);
  });
  it("skips exercises already in today's workout", () => {
    const alt = busyAlternative('Chest Press (Machine)', catalog, ['Bench Press (Dumbbell)', 'Push Up']);
    expect(alt).toBeNull();
  });
  it('waits for the library', () => {
    expect(busyAlternative('Chest Press (Machine)', null)).toBeNull();
  });
});
