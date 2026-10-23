// Gym site Live board: how workout_logs set rows become one entry per real
// workout. Underscore-prefixed so Vercel never counts it as a function.
import { describe, it, expect, beforeEach, vi } from 'vitest';

let liveSessions;
beforeEach(async () => {
  vi.resetModules();
  ({ liveSessions } = (await import('./data-read.js')).__test);
});

// n set rows of one saved session (calories/duration repeated on each row).
const session = (id, { user = 'u1', date = '2026-10-23', plan = 'Core', kcal = 110.6, seconds = 3118, sets = 3, at = '2026-10-23T12:54:22Z' } = {}) =>
  Array.from({ length: sets }, () => ({ user_id: user, log_date: date, session_id: id, plan_name: plan, calories_burned: kcal, duration_seconds: seconds, created_at: at }));

describe('liveSessions', () => {
  it('reads calories once per session, not once per set', () => {
    expect(liveSessions(session('s1', { sets: 17 }))).toEqual([{ memberId: 'u1', date: '2026-10-23', kcal: 110.6, at: '2026-10-23T12:54:22Z' }]);
  });

  it('skips a plan saved in seconds without being trained', () => {
    const rows = [...session('quick', { plan: 'Hyrox Upper', kcal: 187.4, seconds: 22, sets: 22 }), ...session('real')];
    expect(liveSessions(rows).map((s) => s.kcal)).toEqual([110.6]);
  });

  it('counts the same workout saved many times once', () => {
    const rows = Array.from({ length: 25 }, (_, i) => session(`dup-${i}`, { plan: 'Legs', kcal: 188.6, sets: 23, at: `2026-10-19T0${i % 10}:00:00Z` })).flat();
    expect(liveSessions(rows)).toHaveLength(1);
  });

  it('keeps two different workouts on the same day', () => {
    const rows = [...session('a', { plan: 'Upper', kcal: 200 }), ...session('b', { plan: 'Core', kcal: 110.6 })];
    expect(liveSessions(rows).map((s) => s.kcal).sort()).toEqual([110.6, 200]);
  });

  it('keeps sessions with no recorded duration', () => {
    expect(liveSessions(session('old', { seconds: null }))).toHaveLength(1);
  });
});
