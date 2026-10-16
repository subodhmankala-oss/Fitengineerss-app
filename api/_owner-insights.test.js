// Gym-owner analytics (api/_ownerInsights.js) and the member-profile endpoint.
// Underscore-prefixed so Vercel never counts it as a function.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildOwnerGymPayload, buildMemberPayload, engagementOf, istToday, daysAgoOf } from './_ownerInsights.js';

// 2026-10-14 12:00 UTC = 17:30 IST on 2026-10-14.
const NOW = new Date('2026-10-14T12:00:00Z');
const ago = (n) => new Date(Date.parse('2026-10-14T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);

const GYM = { id: 'g1', name: 'Test Gym', join_code: 'GYM-QFAP', status: 'active', owner_id: 'own' };
const member = (id, extra = {}) => ({ id, role: 'client', full_name: id.toUpperCase(), coach_id: 't1', created_at: '2026-01-01T00:00:00Z', ...extra });
const trainer = (id, extra = {}) => ({ id, role: 'coach', full_name: `Trainer ${id}`, email: `${id}@x`, ...extra });
const days = (user, offsets, createdAt) => offsets.map((n) => ({ user_id: user, log_date: ago(n), created_at: createdAt || `${ago(n)}T12:00:00Z` }));

describe('dates', () => {
  it('counts "today" in India time, not UTC', () => {
    expect(istToday(new Date('2026-10-14T20:00:00Z'))).toBe('2026-10-15'); // 01:30 IST next day
    expect(istToday(new Date('2026-10-14T10:00:00Z'))).toBe('2026-10-14');
    expect(daysAgoOf('2026-10-10', '2026-10-14')).toBe(4);
  });
});

describe('engagementOf', () => {
  const base = { recent14: 0, prior28: 0, lastDaysAgo: null, joinedDaysAgo: 100 };
  it('never trained: new if they just joined, otherwise inactive', () => {
    expect(engagementOf({ ...base, joinedDaysAgo: 3 })).toBe('new');
    expect(engagementOf({ ...base, joinedDaysAgo: 40 })).toBe('inactive');
  });
  it('quiet = nothing for 14+ days', () => {
    expect(engagementOf({ ...base, lastDaysAgo: 14, prior28: 8 })).toBe('quiet');
  });
  it('slipping = trained often before, under half as often lately', () => {
    // 12 in the 4 weeks before (3/wk) -> 2 in the last 2 weeks (1/wk)
    expect(engagementOf({ ...base, lastDaysAgo: 5, prior28: 12, recent14: 2 })).toBe('slipping');
  });
  it('thriving = 2+/week and not dropping; otherwise steady', () => {
    expect(engagementOf({ ...base, lastDaysAgo: 1, prior28: 8, recent14: 6 })).toBe('thriving');
    expect(engagementOf({ ...base, lastDaysAgo: 2, prior28: 4, recent14: 2 })).toBe('steady');
    expect(engagementOf({ ...base, lastDaysAgo: 2, prior28: 0, recent14: 1 })).toBe('steady'); // just starting
  });
});

describe('buildOwnerGymPayload', () => {
  const members = [
    trainer('t1'), trainer('t2'),
    member('a'), // thriving: 3/wk now and before
    member('b'), // slipping
    member('c'), // quiet
    member('d', { coach_id: 't2' }), // inactive (joined long ago, never trained)
    member('e', { coach_id: null, created_at: '2026-10-12T00:00:00Z' }) // new
  ];
  const logs = [
    ...days('a', [0, 2, 4, 6, 8, 10, 12, 16, 18, 20, 24, 26, 30, 32, 34]),
    ...days('b', [9, 12, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34]),
    ...days('c', [20, 22, 25, 28, 30])
  ];
  const out = buildOwnerGymPayload(GYM, members, logs, NOW);
  const by = (id) => out.clients.find((c) => c.id === id);

  it('labels each member from their own pattern', () => {
    expect(by('a').engagement.status).toBe('thriving');
    expect(by('b').engagement.status).toBe('slipping');
    expect(by('c').engagement.status).toBe('quiet');
    expect(by('d').engagement.status).toBe('inactive');
    expect(by('e').engagement.status).toBe('new');
    expect(out.insights.health).toEqual({ thriving: 1, steady: 0, slipping: 1, quiet: 1, inactive: 1, new: 1 });
  });

  it('keeps the exact numbers behind the label so the owner can see why', () => {
    expect(by('b').engagement.recent14).toBe(2);
    expect(by('b').engagement.prior28).toBe(10);
    expect(by('a').workouts7d).toBe(4);
    expect(by('a').recentDays).toEqual([ago(0), ago(2), ago(4), ago(6)]);
  });

  it('builds the 8-week trend oldest → newest from distinct member-days', () => {
    const { weekly } = out.insights;
    expect(weekly).toHaveLength(8);
    expect(weekly[7].workouts).toBe(4); // member a: days 0,2,4,6 (b's first day is 9 ago)
    expect(weekly[7].members).toBe(1);
    expect(weekly.reduce((s, w) => s + w.workouts, 0)).toBe(by('a').weeks.reduce((x, y) => x + y, 0) + by('b').weeks.reduce((x, y) => x + y, 0) + by('c').weeks.reduce((x, y) => x + y, 0));
  });

  it('scores each trainer: active %, workouts per client per week, members slipping', () => {
    const t1 = out.trainers.find((t) => t.id === 't1');
    const t2 = out.trainers.find((t) => t.id === 't2');
    // t1 has a, b, c (e has no trainer)
    expect(t1.clientCount).toBe(3);
    expect(t1.stats.active14).toBe(2); // a and b trained in the last 14 days; c did not
    expect(t1.stats.activePct).toBe(67);
    expect(t1.stats.atRisk).toBe(2); // b slipping + c quiet
    expect(t1.stats.perClientWeek).toBeGreaterThan(0);
    expect(t1.stats.weekly).toHaveLength(8);
    expect(t2.clientCount).toBe(1);
    expect(t2.stats.activePct).toBe(0);
    expect(t2.stats.atRisk).toBe(1);
  });

  it('a trainer with no clients has no percentage instead of a divide-by-zero', () => {
    const o = buildOwnerGymPayload(GYM, [trainer('t9')], [], NOW);
    expect(o.trainers[0].stats).toMatchObject({ activePct: null, perClientWeek: null, atRisk: 0 });
  });

  it('maps training times to a Monday-first IST grid', () => {
    // Wed 2026-10-14: 07:30 UTC = 13:00 IST (hour 13); saved first at that time
    const peak = buildOwnerGymPayload(GYM, [trainer('t1'), member('a')], [
      { user_id: 'a', log_date: '2026-10-14', created_at: '2026-10-14T07:30:00Z' },
      { user_id: 'a', log_date: '2026-10-14', created_at: '2026-10-14T09:00:00Z' }, // same day, later set: not counted twice
      { user_id: 'a', log_date: '2026-10-13', created_at: '2026-10-13T14:00:00Z' }  // Tue 19:30 IST
    ], NOW).insights.peak;
    expect(peak.total).toBe(2);
    expect(peak.grid[2][13]).toBe(1); // Wednesday, 13:00
    expect(peak.grid[1][19]).toBe(1); // Tuesday, 19:00
  });

  it('a late-night UTC save lands on the next IST day', () => {
    const peak = buildOwnerGymPayload(GYM, [trainer('t1'), member('a')], [
      { user_id: 'a', log_date: '2026-10-14', created_at: '2026-10-14T20:00:00Z' } // Thu 01:30 IST
    ], NOW).insights.peak;
    expect(peak.grid[3][1]).toBe(1);
  });
});

describe('buildMemberPayload', () => {
  const logs = [
    { log_date: ago(1), plan_name: 'Upper A', exercise_name: 'Bench Press', reps: 8, weight_kg: 60, session_id: 's1' },
    { log_date: ago(1), plan_name: 'Upper A', exercise_name: 'Bench Press', reps: 8, weight_kg: 60, session_id: 's1' },
    { log_date: ago(1), plan_name: 'Upper A', exercise_name: 'Row', reps: 10, weight_kg: 40, session_id: 's1' },
    { log_date: ago(4), plan_name: 'Lower A', exercise_name: 'Squat', reps: 5, weight_kg: null, session_id: 's2' },
    { log_date: ago(40), plan_name: 'Upper A', exercise_name: 'Bench Press', reps: 8, weight_kg: 55, session_id: 's3' }
  ];
  const out = buildMemberPayload({
    user: { id: 'm1', full_name: 'Ravi', email: 'ravi@x', phone: '+919000000103', created_at: '2026-09-01T00:00:00Z', coach_id: 't2', gym_self_guided: false },
    client: { fitness_goal: 'Fat loss', program: 'Gym Beginner', program_started_on: '2026-09-02', total_sessions: 12 },
    logs,
    history: [
      { coach_id: 't2', source: 'owner_assign', started_at: '2026-10-01T00:00:00Z', ended_at: null },
      { coach_id: 't1', source: 'invite_code', started_at: '2026-09-01T00:00:00Z', ended_at: '2026-10-01T00:00:00Z' },
      { coach_id: 'own', source: 'backfill', started_at: '2026-08-01T00:00:00Z', ended_at: '2026-09-01T00:00:00Z' },
      { coach_id: null, source: 'owner_assign', started_at: '2026-07-01T00:00:00Z', ended_at: '2026-08-01T00:00:00Z' }
    ],
    names: { t1: 'Asha', t2: 'Meena' },
    ownerId: 'own'
  }, NOW);

  it('groups sets into sessions with exercises, sets and volume', () => {
    expect(out.sessions[0]).toEqual({ date: ago(1), plan: 'Upper A', exercises: 2, sets: 3, volumeKg: 8 * 60 * 2 + 10 * 40 });
    expect(out.sessions[1]).toEqual({ date: ago(4), plan: 'Lower A', exercises: 1, sets: 1, volumeKg: 0 }); // bodyweight: no kg
    expect(out.sessions).toHaveLength(3);
  });

  it('summarises activity over 30 and 90 days with 12 weekly bars', () => {
    expect(out.stats).toMatchObject({ workouts30d: 2, workouts90d: 3, lastWorkout: ago(1) });
    expect(out.stats.weeks).toHaveLength(12);
    expect(out.stats.weeks.reduce((a, b) => a + b, 0)).toBe(3);
    expect(out.stats.weeks[11]).toBe(2); // this week: 1 and 4 days ago
  });

  it('shows who coached them and how they came to be with them', () => {
    expect(out.member.trainerName).toBe('Meena');
    expect(out.history.map((h) => [h.trainerName, h.how])).toEqual([
      ['Meena', 'Assigned by the gym owner'],
      ['Asha', 'Joined with their invite code'],
      ['You', 'With them since before the gym tracked it'],
      ['No trainer', 'Assigned by the gym owner']
    ]);
    expect(out.member).toMatchObject({ goal: 'Fat loss', program: 'Gym Beginner', totalSessions: 12 });
  });

  it('never includes private notes, photos or body measurements', () => {
    const keys = JSON.stringify(out);
    expect(keys).not.toMatch(/note|photo|weight_kg|height|measure/i);
  });
});

describe('api/data-read owner-member access', () => {
  let handler;
  let owned;
  let targetInGym;
  const CLIENT = '11111111-1111-4111-8111-111111111111';
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  const mockRes = () => {
    const res = { statusCode: 200, body: null };
    res.setHeader = () => {};
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.end = () => res;
    return res;
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    owned = true;
    targetInGym = true;
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = decodeURIComponent(String(url));
      if (u.includes('/auth/v1/user')) {
        return (opts.headers?.Authorization || '') === 'Bearer owner-token' ? ok({ email: 'owner@x.com' }) : { ok: false, status: 401, json: async () => ({}) };
      }
      if (u.includes('/rest/v1/users?email=ilike.')) return ok([{ id: 'owner-id' }]);
      if (u.includes('/rest/v1/gyms?owner_id=eq.owner-id')) return ok(owned ? [{ id: 'g1' }] : []);
      if (u.includes(`/rest/v1/users?id=eq.${CLIENT}`)) {
        // the gym scoping must be in the query itself
        const scoped = u.includes('gym_id=eq.g1') && u.includes('role=eq.client');
        return ok(scoped && targetInGym ? [{ id: CLIENT, full_name: 'Ravi', email: 'r@x', coach_id: null }] : []);
      }
      return ok([]);
    });
    handler = (await import('./data-read.js')).default;
  });

  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  const call = async (token, body) => {
    const res = mockRes();
    await handler({ method: 'POST', query: { resource: 'owner-member' }, headers: token ? { authorization: `Bearer ${token}`, host: 'app.example.com' } : { host: 'app.example.com' }, body }, res);
    return res;
  };

  it('returns the profile for a member of the caller’s gym', async () => {
    const res = await call('owner-token', { clientId: CLIENT });
    expect(res.statusCode).toBe(200);
    expect(res.body.member.name).toBe('Ravi');
    expect(res.body.stats.weeks).toHaveLength(12);
  });

  it('403s a member of another gym — scoping is part of the database query', async () => {
    targetInGym = false;
    const res = await call('owner-token', { clientId: CLIENT });
    expect(res.statusCode).toBe(403);
  });

  it('403s a caller who owns no gym', async () => {
    owned = false;
    expect((await call('owner-token', { clientId: CLIENT })).statusCode).toBe(403);
  });

  it('401 without a session; 400 for a bad id', async () => {
    expect((await call(null, { clientId: CLIENT })).statusCode).toBe(401);
    expect((await call('owner-token', { clientId: 'nope' })).statusCode).toBe(400);
  });
});
