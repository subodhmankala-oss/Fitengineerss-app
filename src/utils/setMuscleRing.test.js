import { describe, it, expect } from 'vitest';
import { getSetRingStates, weekRangeFor } from './setMuscleRing';

const press = (sets) => ({ name: 'Incline Dumbbell Press', sets });
const done = (weight, reps) => ({ isCompleted: true, weight: String(weight), reps: String(reps) });

describe('weekRangeFor', () => {
  it('is Monday to Sunday', () => {
    expect(weekRangeFor('2026-11-15')).toEqual(['2026-11-09', '2026-11-15']); // Sunday
    expect(weekRangeFor('2026-11-09')).toEqual(['2026-11-09', '2026-11-15']); // Monday
  });
});

describe('getSetRingStates', () => {
  // Beginner large muscle band is 8–12, so the ring is full at 8 chest sets.
  const saved = Array.from({ length: 6 }, () => ({ log_date: '2026-11-10', exercise_name: 'Bench Press', weight_kg: 40, reps: 8, set_type: 'normal' }));

  it('adds each ticked set to this week\'s saved sets, turning green at target', () => {
    const r = getSetRingStates(saved, [press([done(5, 10), done(5, 10), done(5, 10)])], '2026-11-15', 'beginner');
    expect(r['0-0']).toMatchObject({ state: 'progress', muscle: 'Chest', sets: 7, target: 8 });
    expect(r['0-1']).toMatchObject({ state: 'done', sets: 8, fraction: 1 });
    expect(r['0-2'].state).toBe('done');
  });

  it('uses the heat map colours: blue under target, green at target, orange over the band', () => {
    const many = Array.from({ length: 12 }, () => saved[0]);
    const r = getSetRingStates(saved, [press([done(5, 10), done(5, 10)])], '2026-11-15', 'beginner');
    expect(r['0-0'].color).toBe('#3b82f6');
    expect(r['0-1'].color).toBe('#10b981');
    const over = getSetRingStates(many, [press([done(5, 10)])], '2026-11-15', 'beginner');
    expect(over['0-0'].color).toBe('#f97316');
  });

  it('ignores last week\'s sets', () => {
    const old = saved.map(l => ({ ...l, log_date: '2026-11-08' }));
    const r = getSetRingStates(old, [press([done(5, 10)])], '2026-11-15', 'beginner');
    expect(r['0-0'].sets).toBe(1);
  });

  it('marks a ticked set with no kg as not counted, unticked sets idle, and skips warmups', () => {
    const r = getSetRingStates([], [press([{ isCompleted: true, weight: '', reps: '10' }, { isCompleted: false, weight: '5', reps: '10' }, { ...done(5, 10), isWarmup: true }])], '2026-11-15', 'beginner');
    expect(r['0-0'].state).toBe('none');
    expect(r['0-1']).toMatchObject({ state: 'idle', sets: 0 });
    expect(r['0-2']).toBeUndefined();
  });
});
