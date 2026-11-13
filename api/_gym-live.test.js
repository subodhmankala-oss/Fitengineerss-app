// Gym site Live board: how workout_logs set rows become one entry per real
// workout. Underscore-prefixed so Vercel never counts it as a function.
import { describe, it, expect, beforeEach, vi } from 'vitest';

let liveSessions;
let liveInProgress;
let publicLivePayload;
let monthStats;
let shortName;
let isCurrentMember;
beforeEach(async () => {
  vi.resetModules();
  ({ liveSessions, liveInProgress, publicLivePayload, shortName, isCurrentMember, monthStats } = (await import('./data-read.js')).__test);
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

  it('drops a workout with no tick for over 90 minutes, even if the app just re-saved it', () => {
    expect(liveInProgress([draft('u1', [tick(NOW - 100 * 60000)])], {}, NOW)).toEqual([]);
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

  it("shows the phone's own kcal when the draft carries it, whatever weight the server has", () => {
    const out = liveInProgress([draft('u1', [tick(NOW - 600000), tick(NOW - 300000)], { live_kcal: 123.4 })], { u1: 140 }, NOW);
    expect(out[0].kcal).toBe(123.4);
  });

  it('adds a phone kcal and a trainer kcal for one member, and estimates a draft from an older app', () => {
    const old = liveInProgress([draft('u1', [tick(NOW - 600000)])], {}, NOW)[0].kcal;
    const out = liveInProgress([draft('u1', [tick(NOW - 600000)], { live_kcal: 50 }), draft('u1', [tick(NOW - 500000)], { source: 'coach' })], {}, NOW);
    expect(out[0].kcal).toBeCloseTo(50 + old, 1);
  });
});

describe('shared board payload', () => {
  const full = {
    gym: { id: 'g1' }, today: '2026-11-07', weekStart: '2026-11-02',
    inProgress: [{ memberId: 'u1', kcal: 50, sets: 2, lastTickAt: null, withTrainer: false }],
    members: [{ id: 'u1', name: 'Vinay Kumar Naidu', email: 'vinay@x.com', avatarUrl: 'http://p/1.jpg', sex: 'male' }],
    sessions: [{ memberId: 'u1', date: '2026-11-07', kcal: 100, at: 't' }]
  };

  it('never carries emails or real ids', () => {
    const text = JSON.stringify(publicLivePayload(full, 'Test Gym'));
    expect(text).not.toContain('vinay@x.com');
    expect(text).not.toContain('"u1"');
    expect(text).not.toContain('g1');
    expect(text).not.toContain('Naidu');
  });

  it('keeps the same member linked across members, sessions and open workouts', () => {
    const out = publicLivePayload(full, 'Test Gym');
    expect(out.sessions[0].memberId).toBe(out.members[0].id);
    expect(out.inProgress[0].memberId).toBe(out.members[0].id);
    expect(out.gym).toEqual({ name: 'Test Gym' });
  });

  it('adds only the two board numbers per member, nothing behind them', () => {
    const withStats = { ...full, members: [{ ...full.members[0], monthDays: 9, improvement: 4 }] };
    const out = publicLivePayload(withStats, 'Test Gym');
    expect(Object.keys(out.members[0]).sort()).toEqual(['avatarUrl', 'id', 'improvement', 'monthDays', 'name', 'sex']);
    expect(out.members[0]).toMatchObject({ name: 'Vinay N.', monthDays: 9, improvement: 4 });
  });

  it('shortens names', () => {
    expect(shortName('Vinay Naidu')).toBe('Vinay N.');
    expect(shortName('gk.goginenikiran')).toBe('gk.goginenikiran');
    expect(shortName('someone@gmail.com')).toBe('someone');
    expect(shortName('')).toBe('Member');
  });
});

describe('isCurrentMember', () => {
  it('keeps a client with their coach, and a gym member with no trainer', () => {
    expect(isCurrentMember({ coach_id: 'c1' }, { coach_id: 'c1', paused_at: null })).toBe(true);
    expect(isCurrentMember({ coach_id: null }, { coach_id: null, paused_at: null })).toBe(true);
    expect(isCurrentMember({ coach_id: 'c1' }, undefined)).toBe(true);
  });
  it('drops a client disconnected from their coach', () => {
    expect(isCurrentMember({ coach_id: 'c1' }, { coach_id: null, paused_at: null })).toBe(false);
  });
  it('drops a paused client', () => {
    expect(isCurrentMember({ coach_id: 'c1' }, { coach_id: 'c1', paused_at: '2026-10-02T00:00:00Z' })).toBe(false);
  });
});

describe('monthStats (Most consistent / Most improved)', () => {
  const s = (memberId, date) => ({ memberId, date, kcal: 100, at: 't' });
  const TODAY = '2026-11-10';

  it('counts distinct days this month and the gain over the same days last month', () => {
    const sessions = [
      s('a', '2026-11-02'), s('a', '2026-11-02'), s('a', '2026-11-05'), s('a', '2026-11-09'),
      s('a', '2026-10-03'), s('a', '2026-10-09'),
      s('a', '2026-10-20') // after day 10 of last month: not compared
    ];
    expect(monthStats(sessions, TODAY).a).toEqual({ monthDays: 3, improvement: 2 });
  });

  it('never goes below zero and ignores members with no workout in that span last month', () => {
    const sessions = [s('b', '2026-11-01'), s('b', '2026-10-01'), s('b', '2026-10-02'), s('c', '2026-11-03'), s('c', '2026-11-04')];
    expect(monthStats(sessions, TODAY).b).toEqual({ monthDays: 1, improvement: 0 });
    expect(monthStats(sessions, TODAY).c).toEqual({ monthDays: 2, improvement: 0 });
  });

  it('rolls over the year (January compares with December)', () => {
    expect(monthStats([s('a', '2027-01-02'), s('a', '2027-01-03'), s('a', '2026-12-01')], '2027-01-05').a).toEqual({ monthDays: 2, improvement: 1 });
  });
});
