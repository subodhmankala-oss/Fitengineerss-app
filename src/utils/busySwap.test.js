import { describe, it, expect } from 'vitest';
import { busyAlternatives, busyPrompt, isStationExercise, nextBusyOption } from './busySwap';

const ID = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const catalog = [
  { id: ID(1), name: 'Chest Press (Machine)', muscle: 'Chest', category: 'Chest' },
  { id: ID(2), name: 'Bench Press (Dumbbell)', muscle: 'Chest', category: 'Chest' },
  { id: ID(3), name: 'Cable Fly', muscle: 'Chest', category: 'Chest' },
  { id: ID(4), name: 'Push Up', muscle: 'Chest', category: 'Chest' },
  { id: ID(5), name: 'Barbell Curl', muscle: 'Biceps', category: 'Arms' },
  { id: ID(6), name: 'Lat Pull Down', muscle: 'Back', category: 'Back' },
  { id: ID(7), name: 'Pull-up', muscle: 'Back', category: 'Back' },
  { id: ID(8), name: 'Dumbbell Row', muscle: 'Back', category: 'Back' },
  { id: ID(9), name: 'Inverted Row', muscle: 'Back', category: 'Back' },
  { id: ID(10), name: 'Assisted Pull-up', muscle: 'Back', category: 'Back' },
  { id: ID(11), name: 'Barbell Row', muscle: 'Back', category: 'Back' }
];

describe('Busy? swap options', () => {
  it('every exercise gets options, including bodyweight ones', () => {
    expect(isStationExercise('Chest Press (Machine)')).toBe(true);
    expect(isStationExercise('Lat Pull Down')).toBe(true);
    const alts = busyAlternatives('Push Up', catalog);
    expect(alts.length).toBeGreaterThan(0);
    alts.forEach(a => expect(a.name).not.toBe('Push Up'));
  });
  it('a barbell exercise gets stand-ins that need no barbell', () => {
    const alts = busyAlternatives('Barbell Row', catalog);
    expect(alts.length).toBeGreaterThan(0);
    alts.forEach(a => expect(a.name).not.toMatch(/barbell/i));
  });
  it('gives up to 3 options, none needing another machine', () => {
    const alts = busyAlternatives('Lat Pull Down', catalog);
    expect(alts.length).toBe(3);
    alts.forEach(a => expect(isStationExercise(a.name)).toBe(false));
  });
  it('puts moves most people cannot do (Pull-up) after the rest', () => {
    const names = busyAlternatives('Lat Pull Down', catalog, [], 5).map(a => a.name);
    expect(names).toContain('Pull-up');
    expect(names[names.length - 1]).toBe('Pull-up');
    expect(names.indexOf('Assisted Pull-up')).toBeLessThan(names.indexOf('Pull-up'));
  });
  it('dumbbell exercises get stand-ins that need no dumbbells', () => {
    const alts = busyAlternatives('Bench Press (Dumbbell)', catalog);
    expect(alts.length).toBeGreaterThan(0);
    alts.forEach(a => expect(a.name).not.toMatch(/dumbbell/i));
  });
  it("skips exercises already in today's workout, and waits for the library", () => {
    const names = busyAlternatives('Lat Pull Down', catalog, ['Dumbbell Row']).map(a => a.name);
    expect(names).not.toContain('Dumbbell Row');
    expect(busyAlternatives('Lat Pull Down', null)).toEqual([]);
  });
});

describe('Busy? swap chain', () => {
  const card = (name, extra = {}) => ({ name, sets: [{ reps: '10', isCompleted: false }], ...extra });

  it('offers the next stand-in after each swap, up to 3, never repeating', () => {
    const first = nextBusyOption(card('Lat Pull Down'), catalog, ['Lat Pull Down']);
    expect(first.base).toBe('Lat Pull Down');
    expect(first.tried).toEqual([first.name]);

    const afterOne = card(first.name, { swappedFrom: 'Lat Pull Down', busyBase: first.base, busyTried: first.tried });
    const second = nextBusyOption(afterOne, catalog, [first.name]);
    expect(second.name).not.toBe(first.name);
    expect(second.tried).toEqual([first.name, second.name]);

    const afterTwo = card(second.name, { swappedFrom: first.name, busyBase: 'Lat Pull Down', busyTried: second.tried });
    const third = nextBusyOption(afterTwo, catalog, [second.name]);
    expect([first.name, second.name]).not.toContain(third.name);

    const afterThree = card(third.name, { swappedFrom: second.name, busyBase: 'Lat Pull Down', busyTried: third.tried });
    expect(nextBusyOption(afterThree, catalog, [third.name])).toBeNull();
  });

  it('no Busy? on a card swapped from the menu, or once a set is ticked', () => {
    expect(nextBusyOption(card('Dumbbell Row', { swappedFrom: 'Lat Pull Down' }), catalog)).toBeNull();
    expect(nextBusyOption({ name: 'Lat Pull Down', sets: [{ isCompleted: true }] }, catalog)).toBeNull();
  });
});

describe('Busy? prompt names what the exercise needs', () => {
  it.each([
    ['Lat Pull Down', 'Machine busy?'],
    ['Cable Row', 'Cable busy?'],
    ['Chest Press (Machine)', 'Machine busy?'],
    ['Bench Press (Dumbbell)', 'Dumbbells taken?'],
    ['Decline Bench Press', 'Bench taken?'],
    ['Incline Bench Press', 'Bench taken?'],
    ['Back Squat', 'Rack taken?'],
    ['Pull-up', 'Bar taken?'],
    ['Bird dog', 'Mat taken?'],
    ['Plank', 'Mat taken?'],
    ['Triceps Pushdown', 'Cable busy?'],
    ['Face Pull', 'Cable busy?'],
    ['Farmer Walk', 'Dumbbells taken?'],
    ['Lateral Raise', 'Dumbbells taken?'],
    ['Cycling', 'Bike busy?'],
    ['Sit Up', 'Mat taken?'],
    ['Jumping Jack', 'Spot taken?']
  ])('%s → %s', (name, want) => {
    expect(busyPrompt(name)).toBe(want);
  });
});
