import { describe, it, expect } from 'vitest';
import { buildRecentWorkoutPlans } from './liveWorkoutTimer';

const sess = (date, planName, exercises = [{ name: 'Squat', sets: [{ reps: 10, weight: 40, setType: null, isWarmup: false }] }]) =>
  ({ date, planName, exercises });

describe('buildRecentWorkoutPlans', () => {
  it('lists one entry per name, most recent first', () => {
    const out = buildRecentWorkoutPlans([
      sess('2026-10-01', 'Day 1'),
      sess('2026-10-03', 'Day 2'),
      sess('2026-10-05', 'day 1 '),
    ]);
    expect(out.map(p => [p.planName, p.date])).toEqual([['day 1', '2026-10-05'], ['Day 2', '2026-10-03']]);
    expect(out[0].createdBy).toBe('recent');
  });

  it('skips names already saved as plans and sessions with no sets', () => {
    const out = buildRecentWorkoutPlans([
      sess('2026-10-01', 'Conditioning day4'),
      sess('2026-10-02', 'Empty', [{ name: 'Squat', sets: [] }]),
      sess('2026-10-03', 'Conditioning day1'),
    ], ['conditioning DAY4']);
    expect(out.map(p => p.planName)).toEqual(['Conditioning day1']);
  });

  it('keeps only reusable set fields and respects the limit', () => {
    const out = buildRecentWorkoutPlans(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((n, i) => sess(`2026-10-0${i + 1}`, n)),
      [],
      5
    );
    expect(out).toHaveLength(5);
    expect(out[0].planName).toBe('f');
    expect(out[0].exercises[0].sets[0]).toEqual({ reps: 10, weight: 40 });
  });
});
