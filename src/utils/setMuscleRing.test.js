import { describe, it, expect } from 'vitest';
import { getSetRingStates, weekRangeFor } from './setMuscleRing';

const curl = (sets) => ({ name: 'Barbell Curl', sets });
const done = (weight, reps) => ({ isCompleted: true, weight: String(weight), reps: String(reps) });
const savedCurls = (n, date = '2026-11-10') => Array.from({ length: n }, () => ({ log_date: date, exercise_name: 'Barbell Curl', weight_kg: 20, reps: 10, set_type: 'normal' }));

describe('weekRangeFor', () => {
  it('is Monday to Sunday', () => {
    expect(weekRangeFor('2026-11-15')).toEqual(['2026-11-09', '2026-11-15']); // Sunday
    expect(weekRangeFor('2026-11-09')).toEqual(['2026-11-09', '2026-11-15']); // Monday
  });
});

describe('getSetRingStates', () => {
  // Beginner small-muscle band is 4–8: the ring is full at 4 biceps sets.
  it('adds each ticked set to this week\'s saved sets, turning green at target', () => {
    const r = getSetRingStates(savedCurls(2), [curl([done(20, 10), done(20, 10), done(20, 10)])], '2026-11-15', 'beginner');
    expect(r['0-0']).toMatchObject({ state: 'progress', muscle: 'Biceps', region: null, sets: 3, target: 4 });
    expect(r['0-1']).toMatchObject({ state: 'done', sets: 4, fraction: 1 });
    expect(r['0-2'].state).toBe('done');
  });

  it('ignores last week\'s sets', () => {
    const r = getSetRingStates(savedCurls(6, '2026-11-08'), [curl([done(20, 10)])], '2026-11-15', 'beginner');
    expect(r['0-0'].sets).toBe(1);
  });

  it('marks a ticked set with no kg as not counted, unticked sets idle, and skips warmups', () => {
    const r = getSetRingStates([], [curl([{ isCompleted: true, weight: '', reps: '10' }, { isCompleted: false, weight: '5', reps: '10' }, { ...done(5, 10), isWarmup: true }])], '2026-11-15', 'beginner');
    expect(r['0-0'].state).toBe('none');
    expect(r['0-1']).toMatchObject({ state: 'idle', sets: 0 });
    expect(r['0-2']).toBeUndefined();
  });

  it('uses the Muscle Balance status colours', () => {
    const r = getSetRingStates([], [curl([done(20, 10), done(20, 10), done(20, 10), done(20, 10)])], '2026-11-15', 'beginner');
    expect(r['0-0'].color).toBe('#f97316'); // 1 of 4: undertrained
    expect(r['0-2'].color).toBe('#eab308'); // 3 of 4: slightly low
    expect(r['0-3'].color).toBe('#10b981'); // 4 of 4: optimal
    const over = getSetRingStates(savedCurls(8), [curl([done(20, 10)])], '2026-11-15', 'beginner');
    expect(over['0-0'].color).toBe('#3b82f6'); // 9, over 8: high volume
  });

  // Reported 2026-11-15: Lateral Raise showed 17/12 (all of Shoulders, mostly
  // pressing) while the nudge under it said Side Delts 3/4.
  it('counts only the part a Back/Chest/Shoulders exercise works', () => {
    const saved = [
      ...Array.from({ length: 10 }, () => ({ log_date: '2026-11-10', exercise_name: 'Overhead Press', weight_kg: 30, reps: 8, set_type: 'normal' })),
      ...Array.from({ length: 2 }, () => ({ log_date: '2026-11-11', exercise_name: 'Lateral Raise', weight_kg: 5, reps: 12, set_type: 'normal' })),
    ];
    const r = getSetRingStates(saved, [{ name: 'Lateral Raise', sets: [done(5, 12), done(5, 12)] }], '2026-11-15', 'intermediate');
    expect(r['0-0']).toMatchObject({ muscle: 'Side Delts', region: 'Side Delts', sets: 3 });
    expect(r['0-0'].target).toBeLessThan(6);
    expect(r['0-1'].sets).toBe(4);
  });
});
