// A /w/<token> link must give a visitor that one workout and nothing else:
// no ids, no switched-off parts, no other session — and no way to write.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TOKEN = 'A'.repeat(22);
let rows;
let writes;

const json = (data, status = 200) => ({ ok: status < 300, status, json: async () => data, text: async () => JSON.stringify(data) });

const fakeFetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.pathname === '/auth/v1/user') return json({ email: 'caller@example.com' });
  const table = u.pathname.replace('/rest/v1/', '');
  const method = opts.method || 'GET';
  if (method !== 'GET') {
    writes.push({ table, method, query: u.search, body: opts.body ? JSON.parse(opts.body) : null });
    return json(null);
  }
  if (table === 'workout_logs' && u.searchParams.get('exercise_name')) return json(rows.bests || []);
  return json(rows[table] || []);
};

const mockRes = () => {
  const res = { statusCode: 200, body: null, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.send = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
};

const set = (over) => ({
  id: 'row-1', user_id: 'owner-1', log_date: '2026-11-23', exercise_name: 'Barbell Bench Press', set_number: 1,
  reps: 10, weight_kg: 62.5, distance_km: null, cardio_duration_seconds: null, set_type: null, plan_name: 'Push Day',
  duration_seconds: 3120, calories_burned: 320.4, session_id: 's1', session_row: 0, created_at: '2026-11-23T05:00:00Z',
  avg_heart_rate_bpm: 133, exercise_notes: 'private note', ...over,
});
const share = (over) => ({
  token: TOKEN, user_id: 'owner-1', log_date: '2026-11-23', session_keys: ['sid:s1'],
  show_name: true, show_map: true, show_weights: true, show_calories: true, body_sex: 'female', ...over,
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  writes = [];
  rows = { users: [{ id: 'owner-1', full_name: 'Rahul Sharma' }], workout_shares: [share()], workout_logs: [set(), set({ id: 'row-2', session_row: 1, reps: 8, weight_kg: 65 })] };
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const visit = async (token = TOKEN) => {
  const handler = (await import('./data-read.js')).default;
  const res = mockRes();
  await handler({ method: 'POST', query: { resource: 'shared-workout' }, headers: {}, body: { token } }, res);
  return res;
};
const own = async (body) => {
  const handler = (await import('./save-user-data.js')).default;
  const res = mockRes();
  await handler({ method: 'POST', query: { action: 'workout-share' }, headers: { authorization: 'Bearer user-token' }, body }, res);
  return res;
};

describe('opening a shared workout', () => {
  it('needs no sign-in and shows the workout', async () => {
    const res = await visit();
    expect(res.statusCode).toBe(200);
    expect(res.body.workout).toMatchObject({ title: 'Push Day', name: 'Rahul', durationSeconds: 3120, calories: 320, bodySex: 'female' });
    expect(res.body.workout.exercises[0].sets.map(s => s.weightKg)).toEqual([62.5, 65]);
    expect(writes).toEqual([]);
  });

  it('never sends ids, surname, heart rate or notes', async () => {
    const text = JSON.stringify((await visit()).body);
    ['owner-1', 'row-1', 'Sharma', '133', 'private note', 's1'].forEach(secret => expect(text).not.toContain(secret));
  });

  it('leaves switched-off parts out of the data', async () => {
    rows.workout_shares = [share({ show_name: false, show_weights: false, show_calories: false, show_map: false })];
    const { workout } = (await visit()).body;
    expect(workout).toMatchObject({ name: null, calories: null, showMap: false, bodySex: null });
    expect(JSON.stringify(workout)).not.toMatch(/62\.5|65|320|Rahul|newBest/);
    expect(workout.exercises[0].sets[0].loaded).toBe(true);
  });

  it('does not show another workout logged the same day', async () => {
    rows.workout_logs.push(set({ id: 'row-3', exercise_name: 'Leg Press', session_id: 's2' }));
    const { workout } = (await visit()).body;
    expect(workout.exercises.map(e => e.name)).toEqual(['Barbell Bench Press']);
  });

  it('marks a new best only when it beats an earlier one', async () => {
    rows.bests = [{ weight_kg: 60 }];
    expect((await visit()).body.workout.exercises[0].newBest).toBe(true);
    rows.bests = [{ weight_kg: 65 }];
    expect((await visit()).body.workout.exercises[0].newBest).toBeUndefined();
    rows.bests = [];
    expect((await visit()).body.workout.exercises[0].newBest).toBeUndefined();
  });

  it('is gone after stopping, deleting the workout, or with a wrong link', async () => {
    rows.workout_logs = [];
    expect((await visit()).statusCode).toBe(404);
    rows.workout_shares = [];
    expect((await visit()).statusCode).toBe(404);
    fetch.mockClear();
    expect((await visit("x' or 1=1")).statusCode).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('gives chat apps an escaped preview', async () => {
    rows.workout_logs = [set({ plan_name: '<script>"x"' })];
    const handler = (await import('./data-read.js')).default;
    const res = mockRes();
    await handler({ method: 'GET', query: { resource: 'shared-workout-preview', token: TOKEN }, headers: { host: 'fit.example' } }, res);
    expect(res.headers['Content-Type']).toContain('text/html');
    expect(res.body).toContain('Rahul’s &lt;script&gt;');
    expect(res.body).toContain('1 set · 52 min');
    expect(res.body).not.toContain('<script>');
  });

  it('answers no other GET', async () => {
    const handler = (await import('./data-read.js')).default;
    const res = mockRes();
    await handler({ method: 'GET', query: { resource: 'shared-workout', token: TOKEN }, headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('owner', () => {
  it('shares only their own workout, pinned to what is saved that day', async () => {
    rows.workout_shares = [];
    const res = await own({ op: 'save', logDate: '2026-11-23', token: TOKEN, user_id: 'someone-else', flags: { showWeights: false }, bodySex: 'male' });
    expect(res.statusCode).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: 'workout_shares', method: 'POST', body: { user_id: 'owner-1', token: TOKEN, session_keys: ['sid:s1'], show_weights: false, show_name: true, body_sex: 'male' } });
  });

  it('keeps the link already out there when shared again', async () => {
    await own({ op: 'save', logDate: '2026-11-23', token: 'B'.repeat(22) });
    expect(writes[0].method).toBe('PATCH');
    expect(writes[0].body.token).toBeUndefined();
  });

  it('can share right after Save, before the rows arrive', async () => {
    rows.workout_shares = [];
    rows.workout_logs = [];
    const res = await own({ op: 'save', logDate: '2026-11-23', token: TOKEN, sessionId: 'session-9' });
    expect(res.statusCode).toBe(200);
    expect(writes[0].body.session_keys).toEqual(['sid:session-9']);
  });

  it('refuses a day with nothing saved, or a weak token', async () => {
    rows.workout_shares = [];
    rows.workout_logs = [];
    expect((await own({ op: 'save', logDate: '2026-11-23', token: TOKEN })).statusCode).toBe(404);
    expect((await own({ op: 'save', logDate: '2026-11-23', token: '1' })).statusCode).toBe(400);
    expect(writes).toEqual([]);
  });

  it('changing a switch never touches which workout is shared', async () => {
    await own({ op: 'flags', logDate: '2026-11-23', flags: { showMap: false } });
    expect(writes[0].method).toBe('PATCH');
    expect(writes[0].query).toContain('user_id=eq.owner-1');
    expect(Object.keys(writes[0].body).sort()).toEqual(['show_calories', 'show_map', 'show_name', 'show_weights', 'updated_at']);
  });

  it('stop deletes only their own link', async () => {
    await own({ op: 'stop', logDate: '2026-11-23' });
    expect(writes[0]).toMatchObject({ table: 'workout_shares', method: 'DELETE' });
    expect(writes[0].query).toBe('?user_id=eq.owner-1&log_date=eq.2026-11-23');
  });
});
