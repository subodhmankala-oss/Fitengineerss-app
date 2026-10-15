// Gym owner: data-read owner-gym (scoping + activity maths) and admin-write
// owner-assign-client (owner id from the verified token, never the body).
// Underscore-prefixed so Vercel never counts it as a function.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.setHeader = () => {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
};

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

describe('ownerGymPayload', () => {
  let ownerGymPayload;
  beforeEach(async () => {
    vi.resetModules();
    ({ ownerGymPayload } = (await import('./data-read.js')).__test);
  });

  it('splits trainers/clients, counts distinct workout days, and names trainers', () => {
    const gym = { id: 'g1', name: 'Test Gym', join_code: 'GYM-QFAP', status: 'active', owner_id: 'own' };
    const members = [
      { id: 'own', role: 'coach', full_name: 'Owner', email: 'own@x' },
      { id: 't2', role: 'coach', full_name: null, email: 'asha@x' },
      { id: 'c1', role: 'client', full_name: 'Ravi', coach_id: 'own' },
      { id: 'c2', role: 'client', full_name: 'Meena', coach_id: 'someone-outside' }
    ];
    const logs = [
      // three set rows on the same day count once
      { user_id: 'c1', log_date: '2026-10-13' }, { user_id: 'c1', log_date: '2026-10-13' }, { user_id: 'c1', log_date: '2026-10-13' },
      { user_id: 'c1', log_date: '2026-10-10' },
      { user_id: 'c1', log_date: '2026-09-20' }
    ];
    const out = ownerGymPayload(gym, members, logs, new Date('2026-10-14T12:00:00Z'));

    expect(out.gym).toEqual({ id: 'g1', name: 'Test Gym', joinCode: 'GYM-QFAP', status: 'active', createdAt: undefined });
    expect(out.trainers.map((t) => t.name)).toEqual(['Owner', 'asha']);
    expect(out.trainers[0]).toMatchObject({ isOwner: true, clientCount: 1, activeClients7d: 1 });

    const ravi = out.clients.find((c) => c.id === 'c1');
    expect(ravi).toMatchObject({ trainerName: 'Owner', lastWorkout: '2026-10-13', workouts7d: 2, workouts30d: 3 });
    // a coach outside the gym reads as unassigned
    expect(out.clients.find((c) => c.id === 'c2').trainerName).toBeNull();
  });
});

describe('api/data-read owner-gym', () => {
  let handler;
  let requested;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    requested = [];
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = decodeURIComponent(String(url));
      requested.push(u);
      if (u.includes('/auth/v1/user')) {
        const token = (opts.headers?.Authorization || '').replace('Bearer ', '');
        if (token === 'owner-token') return ok({ email: 'my_owner@x.com' });
        if (token === 'coach-token') return ok({ email: 'coach@x.com' });
        return { ok: false, status: 401, json: async () => ({}) };
      }
      if (u.includes('/rest/v1/users?email=ilike.')) {
        return ok(u.includes('my\\_owner@x.com') ? [{ id: 'own' }] : u.includes('coach@x.com') ? [{ id: 'coach' }] : []);
      }
      if (u.includes('/rest/v1/gyms?owner_id=eq.own')) return ok([{ id: 'g1', name: 'Test Gym', join_code: 'GYM-QFAP', status: 'active', owner_id: 'own' }]);
      if (u.includes('/rest/v1/gyms?owner_id=eq.')) return ok([]);
      if (u.includes('/rest/v1/users?gym_id=eq.g1')) return ok([{ id: 'own', role: 'coach', full_name: 'Owner' }, { id: 'c1', role: 'client', coach_id: 'own' }]);
      if (u.includes('/rest/v1/workout_logs')) return ok([]);
      return ok([]);
    });
    handler = (await import('./data-read.js')).default;
  });

  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  const call = async (token, body = {}) => {
    const res = mockRes();
    await handler({ method: 'POST', query: { resource: 'owner-gym' }, headers: token ? { authorization: `Bearer ${token}`, host: 'app.example.com' } : { host: 'app.example.com' }, body }, res);
    return res;
  };

  it("returns the caller's own gym, with the email's _ escaped in the lookup", async () => {
    const res = await call('owner-token');
    expect(res.statusCode).toBe(200);
    expect(res.body.gym.name).toBe('Test Gym');
    expect(res.body.clients).toHaveLength(1);
    expect(requested.some((u) => u.includes('email=ilike.my\\_owner@x.com'))).toBe(true);
  });

  it('returns gym: null for a coach who owns no gym', async () => {
    const res = await call('coach-token');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ gym: null });
  });

  it('401s without a verified session, even if the body names an owner', async () => {
    const res = await call(null, { email: 'my_owner@x.com' });
    expect(res.statusCode).toBe(401);
  });
});

describe('api/admin-write owner-assign-client', () => {
  let handler;
  let rpcCalls;
  const CLIENT = '11111111-1111-4111-8111-111111111111';
  const COACH = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    rpcCalls = [];
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = decodeURIComponent(String(url));
      if (u.includes('/auth/v1/user')) {
        const token = (opts.headers?.Authorization || '').replace('Bearer ', '');
        return token === 'owner-token' ? ok({ email: 'owner@x.com' }) : { ok: false, status: 401, json: async () => ({}) };
      }
      if (u.includes('/rest/v1/users?email=ilike.')) return ok([{ id: 'owner-id', email: 'owner@x.com' }]);
      if (u.includes('/rest/v1/rpc/owner_assign_client')) {
        const body = JSON.parse(opts.body);
        rpcCalls.push(body);
        return ok(body.p_coach_id === COACH ? { success: true, changed: true } : { success: false, error: 'That trainer is not in your gym.' });
      }
      return ok([]);
    });
    handler = (await import('./admin-write.js')).default;
  });

  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  const call = async (token, body) => {
    const res = mockRes();
    await handler({ method: 'POST', query: { action: 'owner-assign-client' }, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
    return res;
  };

  it('passes the VERIFIED caller as owner, ignoring any owner in the body', async () => {
    const res = await call('owner-token', { clientUserId: CLIENT, coachUserId: COACH, ownerId: 'attacker' });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls).toEqual([{ p_owner_id: 'owner-id', p_client_id: CLIENT, p_coach_id: COACH }]);
  });

  it('403s with the database reason when the move is refused', async () => {
    const res = await call('owner-token', { clientUserId: CLIENT, coachUserId: '33333333-3333-4333-8333-333333333333' });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('That trainer is not in your gym.');
  });

  it('401s without a session and 400s bad ids, without calling the database', async () => {
    expect((await call(null, { clientUserId: CLIENT, coachUserId: COACH })).statusCode).toBe(401);
    expect((await call('owner-token', { clientUserId: 'x', coachUserId: COACH })).statusCode).toBe(400);
    expect(rpcCalls).toEqual([]);
  });
});

describe('api/admin-write owner-unassign-client', () => {
  let handler;
  let rpcCalls;
  const CLIENT = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    rpcCalls = [];
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = decodeURIComponent(String(url));
      if (u.includes('/auth/v1/user')) {
        const token = (opts.headers?.Authorization || '').replace('Bearer ', '');
        return token === 'owner-token' ? ok({ email: 'owner@x.com' }) : { ok: false, status: 401, json: async () => ({}) };
      }
      if (u.includes('/rest/v1/users?email=ilike.')) return ok([{ id: 'owner-id', email: 'owner@x.com' }]);
      if (u.includes('/rest/v1/rpc/owner_unassign_client')) {
        rpcCalls.push(JSON.parse(opts.body));
        return ok({ success: true, changed: true });
      }
      return ok([]);
    });
    handler = (await import('./admin-write.js')).default;
  });

  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  const call = async (token, body) => {
    const res = mockRes();
    await handler({ method: 'POST', query: { action: 'owner-unassign-client' }, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
    return res;
  };

  it('unassigns as the VERIFIED owner, ignoring any owner in the body', async () => {
    const res = await call('owner-token', { clientUserId: CLIENT, ownerId: 'attacker' });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls).toEqual([{ p_owner_id: 'owner-id', p_client_id: CLIENT }]);
  });

  it('401 without a session, 400 for a bad id — no database call', async () => {
    expect((await call(null, { clientUserId: CLIENT })).statusCode).toBe(401);
    expect((await call('owner-token', { clientUserId: 'x' })).statusCode).toBe(400);
    expect(rpcCalls).toEqual([]);
  });
});
