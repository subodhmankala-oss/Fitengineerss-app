// Gym site Live board: how workout_logs set rows become one entry per real
// workout. Underscore-prefixed so Vercel never counts it as a function.
import { describe, it, expect, beforeEach, vi } from 'vitest';

let liveSessions;
let liveInProgress;
beforeEach(async () => {
  vi.resetModules();
  ({ liveSessions, liveInProgress } = (await import('./data-read.js')).__test);
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

describe('liveInProgress', () => {
  const NOW = Date.parse('2026-11-07T10:00:00Z');
  const tick = (at, reps = 10, weight = 60) => ({ reps: String(reps), weight: String(weight), isCompleted: true, completedAt: at });
  const draft = (user, sets, over = {}) => ({
    user_id: user, source: 'self', exercises: [{ name: 'Bench Press', sets }], timer_started_at: NOW - 20 * 60000,
    pause_intervals: [], updated_at: new Date(NOW - 60000).toISOString(), ...over
  });

  it('counts calories from the ticked sets of an open workout', () => {
    const out = liveInProgress([draft('u1', [tick(NOW - 600000), tick(NOW - 300000), { reps: '10', weight: '60', isCompleted: false }])], {}, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ memberId: 'u1', sets: 2, withTrainer: false });
    expect(out[0].kcal).toBeGreaterThan(0);
    expect(out[0].lastTickAt).toBe(new Date(NOW - 300000).toISOString());
  });

  it('shows nobody before their first ticked set', () => {
    expect(liveInProgress([draft('u1', [{ reps: '10', weight: '60', isCompleted: false }])], {}, NOW)).toEqual([]);
  });

  it('drops a workout left open for over 90 minutes', () => {
    const stale = draft('u1', [tick(NOW - 600000)], { updated_at: new Date(NOW - 100 * 60000).toISOString() });
    expect(liveInProgress([stale], {}, NOW)).toEqual([]);
  });

  it('marks a trainer-logged workout and adds two open workouts of one member together', () => {
    const out = liveInProgress([draft('u1', [tick(NOW - 600000)]), draft('u1', [tick(NOW - 500000)], { source: 'coach' })], {}, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ sets: 2, withTrainer: true });
  });

  it('uses the saved body weight of the member when it is known', () => {
    const light = liveInProgress([draft('u1', [{ reps: '20', weight: '0', isCompleted: true, completedAt: NOW - 600000 }], { exercises: [{ name: 'Push-up', sets: [{ reps: '20', weight: '0', isCompleted: true, completedAt: NOW - 600000 }] }] })], { u1: 50 }, NOW);
    const heavy = liveInProgress([draft('u1', [], { exercises: [{ name: 'Push-up', sets: [{ reps: '20', weight: '0', isCompleted: true, completedAt: NOW - 600000 }] }] })], { u1: 100 }, NOW);
    expect(heavy[0].kcal).toBeGreaterThan(light[0].kcal);
  });
});
