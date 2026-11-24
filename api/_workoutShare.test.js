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
  token: TOKEN, user_id: 'owner-1', log_date: '2026-11-23', share_key: 'sid:s1', session_keys: ['sid:s1'], active: true,
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

  const getHtml = async (over) => {
    if (over) rows.workout_shares = [share({ preview_title: 'Push Day', preview_sets: 13, preview_seconds: 3120, has_picture: true, updated_at: '2026-11-23T08:00:00Z', users: { full_name: 'Rahul Sharma' }, ...over })];
    const handler = (await import('./data-read.js')).default;
    const res = mockRes();
    await handler({ method: 'GET', query: { resource: 'shared-workout-preview', token: TOKEN }, headers: { host: 'fit.example' } }, res);
    return res;
  };

  it('shows a photo only when the owner turned it on, and only from Google', async () => {
    const avatar_url = 'https://lh3.googleusercontent.com/a/ACg8abc-_1=s96-c';
    rows.users = [{ id: 'owner-1', full_name: 'Rahul Sharma', avatar_url }];
    expect((await visit()).body.workout).toMatchObject({ showPhoto: false, photo: null });
    rows.workout_shares = [share({ show_photo: true })];
    expect((await visit()).body.workout).toMatchObject({ showPhoto: true, photo: 'https://lh3.googleusercontent.com/a/ACg8abc-_1=s192-c' });
    for (const bad of ['https://evil.example/a=s96-c', 'javascript:alert(1)', 'https://lh3.googleusercontent.com.evil.example/a', null]) {
      rows.users = [{ full_name: 'Rahul Sharma', avatar_url: bad }];
      expect((await visit()).body.workout.photo).toBeNull();
    }
  });

  it('gives chat apps an escaped preview in a single read', async () => {
    fetch.mockClear();
    const res = await getHtml({ preview_title: '<script>"x"' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(res.headers['Content-Type']).toContain('text/html');
    expect(res.body).toContain('Rahul’s &lt;script&gt;');
    expect(res.body).toContain('13 sets · 52 min');
    // Exactly the address the sheet pre-loads.
    expect(res.body).toContain(`content="https://fit.example/w/${TOKEN}/preview.jpg"`);
    expect(res.body).not.toContain('<script>');
    expect(res.body).not.toContain('Sharma');
  });

  it('shows the logo when there is no picture or the map is off, and no name when that is off', async () => {
    expect((await getHtml({ has_picture: false })).body).toContain('/icons/icon-512.png');
    expect((await getHtml({ show_map: false })).body).toContain('/icons/icon-512.png');
    expect((await getHtml({ show_name: false })).body).not.toContain('Rahul');
  });

  it('still previews a link made before these were kept with it', async () => {
    const res = await getHtml({ preview_title: null, has_picture: false });
    expect(res.body).toContain('Rahul’s Push Day');
    expect(res.body).toContain('2 sets · 52 min');
  });

  it('serves the message picture in one read, only for a map that is shown', async () => {
    const handler = (await import('./data-read.js')).default;
    const get = async (method = 'GET') => {
      const res = mockRes();
      await handler({ method, query: { resource: 'shared-workout-picture', token: TOKEN }, headers: {} }, res);
      return res;
    };
    rows.workout_shares = [share({ preview_image: '/9j/AAAA' })];
    fetch.mockClear();
    const ok = await get();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('show_map=is.true');
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['Content-Type']).toBe('image/jpeg');
    expect([...ok.body.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect((await get('HEAD')).statusCode).toBe(200);
    rows.workout_shares = [];
    expect((await get()).statusCode).toBe(404);
  });

  it('only ever reads links that are on', async () => {
    await visit();
    const reads = fetch.mock.calls.map(c => c[0]).filter(u => u.includes('/workout_shares?'));
    expect(reads.length).toBeGreaterThan(0);
    reads.forEach(u => expect(u).toContain('active=is.true'));
  });

  it('answers no other GET', async () => {
    const handler = (await import('./data-read.js')).default;
    const res = mockRes();
    await handler({ method: 'GET', query: { resource: 'shared-workout', token: TOKEN }, headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('owner', () => {
  const KEY = 'sid:s1';
  const base = { logDate: '2026-11-23', key: KEY, token: TOKEN };

  it('shares only their own workout', async () => {
    rows.workout_shares = [];
    const res = await own({ op: 'save', ...base, user_id: 'someone-else', flags: { showWeights: false }, bodySex: 'male', title: 'Push Day', sets: 2, durationSeconds: 3120 });
    expect(res.statusCode).toBe(200);
    expect(writes[0]).toMatchObject({ table: 'workout_shares', method: 'POST', body: { user_id: 'owner-1', token: TOKEN, share_key: KEY, session_keys: [KEY], show_weights: false, show_name: true, body_sex: 'male', preview_title: 'Push Day', preview_sets: 2 } });
  });

  it('never puts two workouts of one day behind one link', async () => {
    rows.workout_shares = [];
    rows.workout_logs.push(set({ id: 'row-9', plan_name: 'Beginner Full Body B', session_id: 's2', exercise_name: 'Squat', created_at: '2026-11-23T09:00:00Z' }));
    await own({ op: 'save', ...base });
    await own({ op: 'save', ...base, key: 'sid:s2', token: 'B'.repeat(22) });
    expect(writes.filter(w => w.method === 'POST').map(w => [w.body.share_key, w.body.session_keys])).toEqual([['sid:s1', ['sid:s1']], ['sid:s2', ['sid:s2']]]);
  });

  it('keeps the link already out there when shared again', async () => {
    await own({ op: 'save', ...base, token: 'B'.repeat(22) });
    expect(writes[0].method).toBe('PATCH');
    expect(writes[0].query).toContain('share_key=eq.sid%3As1');
    expect(writes[0].body.token).toBeUndefined();
  });

  it('opening the sheet stores the picture but turns nothing on', async () => {
    rows.workout_shares = [];
    const res = await own({ op: 'prepare', ...base, image: '/9j/AAAA', flags: { showName: false } });
    expect(res.statusCode).toBe(200);
    expect(writes[0]).toMatchObject({ method: 'POST', body: { user_id: 'owner-1', token: TOKEN, active: false, preview_image: '/9j/AAAA', show_name: false } });
    expect(writes[1].body).toEqual({ preview_image: '/9j/AAAA', picture_shows: null });
  });

  it('a new picture never changes what a live link shows', async () => {
    await own({ op: 'prepare', ...base, image: '/9j/AAAA', flags: { showName: false } });
    expect(Object.keys(writes[0].body)).not.toContain('show_name');
    expect(Object.keys(writes[0].body)).not.toContain('active');
  });

  it('drops a stored picture that shows what is now switched off', async () => {
    await own({ op: 'flags', ...base, flags: { showPhoto: false } });
    expect(writes[1]).toMatchObject({ method: 'PATCH', body: { preview_image: null, picture_shows: null } });
    expect(writes[1].query).toContain('picture_shows=not.is.null');
    writes = [];
    await own({ op: 'flags', ...base, flags: { showPhoto: true, showName: false } });
    expect(writes[1].query).toContain('picture_shows=eq.photo-name');
    writes = [];
    await own({ op: 'flags', ...base, flags: { showPhoto: true } });
    expect(writes).toHaveLength(1);
  });

  it('keeps note of what of the person a picture shows', async () => {
    await own({ op: 'prepare', ...base, image: '/9j/AAAA', shows: 'photo-name' });
    expect(writes[0].body.picture_shows).toBe('photo-name');
    writes = [];
    await own({ op: 'prepare', ...base, image: '/9j/AAAA', shows: 'anything' });
    expect(writes[0].body.picture_shows).toBeNull();
  });

  it('sending turns the prepared link on with the link that was sent', async () => {
    rows.workout_shares = [share({ active: false, token: 'C'.repeat(22) })];
    await own({ op: 'save', ...base });
    expect(writes[0]).toMatchObject({ method: 'PATCH', body: { token: TOKEN, active: true } });
  });

  it('takes nothing but a JPEG as the picture', async () => {
    for (const image of [undefined, '<svg onload=x>', 'iVBORw0KGgo=', `/9j/${'A'.repeat(400001)}`]) {
      expect((await own({ op: 'prepare', ...base, image })).statusCode).toBe(400);
    }
    expect(writes).toEqual([]);
  });

  it('can share right after Save, before the rows arrive', async () => {
    rows.workout_shares = [];
    rows.workout_logs = [];
    const res = await own({ op: 'save', ...base, key: 'sid:session-9' });
    expect(res.statusCode).toBe(200);
    expect(writes[0].body.session_keys).toEqual(['sid:session-9']);
  });

  it('refuses a workout that is not there, a weak token, or no workout named', async () => {
    rows.workout_shares = [];
    rows.workout_logs = [];
    expect((await own({ op: 'save', ...base, key: 'at:2026-11-23T05:00:00Z' })).statusCode).toBe(404);
    expect((await own({ op: 'save', ...base, token: '1' })).statusCode).toBe(400);
    expect((await own({ op: 'save', ...base, key: undefined })).statusCode).toBe(400);
    expect(writes).toEqual([]);
  });

  it('changing a switch never touches which workout is shared', async () => {
    await own({ op: 'flags', ...base, flags: { showMap: false } });
    expect(writes[0].method).toBe('PATCH');
    expect(writes[0].query).toContain('user_id=eq.owner-1');
    expect(Object.keys(writes[0].body).sort()).toEqual(['show_calories', 'show_map', 'show_name', 'show_photo', 'show_weights', 'updated_at']);
  });

  it('stop deletes only their own link for that workout', async () => {
    await own({ op: 'stop', ...base });
    expect(writes[0]).toMatchObject({ table: 'workout_shares', method: 'DELETE' });
    expect(writes[0].query).toBe('?user_id=eq.owner-1&share_key=eq.sid%3As1');
  });
});
