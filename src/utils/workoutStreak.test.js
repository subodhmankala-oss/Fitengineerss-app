import { describe, it, expect } from 'vitest';
import { computeWorkoutStreak, nextStreakMilestone, streakTier, recentStreakDays } from './workoutStreak.js';

const rows = (...dates) => dates.map(log_date => ({ log_date }));

describe('computeWorkoutStreak', () => {
  it('returns an empty streak with no logs', () => {
    expect(computeWorkoutStreak([], '2026-10-14')).toMatchObject({ current: 0, best: 0, status: 'none' });
    expect(computeWorkoutStreak(null, '2026-10-14').current).toBe(0);
  });

  it('counts distinct workout days, ignoring duplicate rows on a day', () => {
    const r = computeWorkoutStreak(rows('2026-10-13', '2026-10-13', '2026-10-14'), '2026-10-14');
    expect(r.current).toBe(2);
    expect(r.status).toBe('active');
    expect(r.trainedToday).toBe(true);
  });

  it('survives up to two rest days between workouts', () => {
    // Oct 10, then 2 rest days (11, 12), then Oct 13
    expect(computeWorkoutStreak(rows('2026-10-10', '2026-10-13'), '2026-10-13').current).toBe(2);
  });

  it('breaks on three rest days between workouts', () => {
    const r = computeWorkoutStreak(rows('2026-10-09', '2026-10-13'), '2026-10-13');
    expect(r.current).toBe(1);
    expect(r.best).toBe(1);
  });

  it('is at risk (still alive) when today is empty but within the allowance', () => {
    const r = computeWorkoutStreak(rows('2026-10-11', '2026-10-12'), '2026-10-14');
    expect(r).toMatchObject({ current: 2, status: 'at_risk', trainedToday: false, keepAliveBy: '2026-10-15' });
  });

  it('lapses to 0 once the allowance is exceeded but keeps best', () => {
    const r = computeWorkoutStreak(rows('2026-10-01', '2026-10-02', '2026-10-03'), '2026-10-14');
    expect(r).toMatchObject({ current: 0, best: 3, status: 'lapsed', keepAliveBy: null });
  });

  it('tracks best separately from current', () => {
    const r = computeWorkoutStreak(
      rows('2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-13', '2026-10-14'),
      '2026-10-14'
    );
    expect(r).toMatchObject({ current: 2, best: 4 });
  });

  it('ignores future and malformed dates', () => {
    const r = computeWorkoutStreak([{ log_date: '2026-10-20' }, { log_date: 'bad' }, { log_date: null }, null], '2026-10-14');
    expect(r.status).toBe('none');
  });
});

describe('nextStreakMilestone', () => {
  it('points at the next milestone with progress from the previous one', () => {
    expect(nextStreakMilestone(1)).toEqual({ target: 3, remaining: 2, progress: 1 / 3 });
    expect(nextStreakMilestone(3)).toMatchObject({ target: 7, remaining: 4, progress: 0 });
    expect(nextStreakMilestone(10)).toMatchObject({ target: 14, remaining: 4 });
  });

  it('returns null past the last milestone', () => {
    expect(nextStreakMilestone(100)).toBeNull();
  });
});

describe('streakTier', () => {
  it('levels up with the streak', () => {
    expect(streakTier(0).title).toBe('Flame’s out');
    expect(streakTier(1).title).toBe('Spark lit!');
    expect(streakTier(5).title).toBe('On fire!');
    expect(streakTier(40).title).toBe('Legend mode');
  });
});

describe('recentStreakDays', () => {
  it('returns the last n days oldest-first with trained/today flags', () => {
    const days = recentStreakDays(rows('2026-10-12', '2026-10-14'), 3, '2026-10-14');
    expect(days).toEqual([
      { date: '2026-10-12', trained: true, isToday: false },
      { date: '2026-10-13', trained: false, isToday: false },
      { date: '2026-10-14', trained: true, isToday: true },
    ]);
  });
});
