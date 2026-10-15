// Trainer joins / leaves a gym: the trainer is always the VERIFIED caller,
// never an id from the body. Plus data-read coach-gym. Underscore-prefixed so
// Vercel never counts it as a function.
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
const unauth = { ok: false, status: 401, json: async () => ({}) };

describe('api/admin-write coach-join-gym / coach-leave-gym', () => {
  let handler;
  let rpcCalls;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    rpcCalls = [];
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = decodeURIComponent(String(url));
      if (u.includes('/auth/v1/user')) {
        return (opts.headers?.Authorization || '') === 'Bearer coach-token' ? ok({ email: 'coach@x.com' }) : unauth;
      }
      if (u.includes('/rest/v1/users?email=ilike.')) return ok([{ id: 'coach-id', email: 'coach@x.com' }]);
      const m = u.match(/\/rest\/v1\/rpc\/(\w+)/);
      if (m) {
        const body = JSON.parse(opts.body);
        rpcCalls.push({ fn: m[1], body });
        if (m[1] === 'coach_join_gym' && body.p_code === 'GYM-ZZZZ') return ok({ success: false, error: 'No gym found with that code. Check it with your gym owner.' });
        return ok({ success: true, gym_name: 'Test Gym', clients_moved: 0 });
      }
      return ok([]);
    });
    handler = (await import('./admin-write.js')).default;
  });

  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  const call = async (action, token, body = {}) => {
    const res = mockRes();
    await handler({ method: 'POST', query: { action }, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
    return res;
  };

  it('joins as the verified caller, ignoring any coach id in the body', async () => {
    const res = await call('coach-join-gym', 'coach-token', { code: 'GYM-QFAP', bringClients: true, coachId: 'someone-else' });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls).toEqual([{ fn: 'coach_join_gym', body: { p_coach_id: 'coach-id', p_code: 'GYM-QFAP', p_bring_clients: true } }]);
  });

  it('bringClients must be literally true', async () => {
    await call('coach-join-gym', 'coach-token', { code: 'GYM-QFAP', bringClients: 'yes' });
    expect(rpcCalls[0].body.p_bring_clients).toBe(false);
  });

  it('passes the database reason through for a bad code', async () => {
    const res = await call('coach-join-gym', 'coach-token', { code: 'GYM-ZZZZ' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/No gym found/);
  });

  it('401s without a session, 400s a missing code — no database call', async () => {
    expect((await call('coach-join-gym', null, { code: 'GYM-QFAP' })).statusCode).toBe(401);
    expect((await call('coach-join-gym', 'coach-token', { code: '  ' })).statusCode).toBe(400);
    expect((await call('coach-leave-gym', null)).statusCode).toBe(401);
    expect(rpcCalls).toEqual([]);
  });

  it('leaves as the verified caller', async () => {
    const res = await call('coach-leave-gym', 'coach-token', { coachId: 'someone-else' });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls).toEqual([{ fn: 'coach_leave_gym', body: { p_coach_id: 'coach-id' } }]);
  });
});

describe('api/data-read coach-gym', () => {
  let handler;
  let gymIdOfCaller;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    gymIdOfCaller = 'g1';
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = decodeURIComponent(String(url));
      if (u.includes('/auth/v1/user')) {
        return (opts.headers?.Authorization || '') === 'Bearer coach-token' ? ok({ email: 'coach@x.com' }) : unauth;
      }
      if (u.includes('/rest/v1/users?email=ilike.')) return ok([{ id: 'coach-id', gym_id: gymIdOfCaller }]);
      if (u.includes('/rest/v1/users?coach_id=eq.coach-id')) return ok([{ id: 'c1' }, { id: 'c2' }]);
      if (u.includes('/rest/v1/gyms?id=eq.g1')) return ok([{ name: 'Test Gym', status: 'active', owner_id: 'owner-id', join_code: 'GYM-QFAP' }]);
      return ok([]);
    });
    handler = (await import('./data-read.js')).default;
  });

  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  const call = async (token) => {
    const res = mockRes();
    await handler({ method: 'POST', query: { resource: 'coach-gym' }, headers: token ? { authorization: `Bearer ${token}`, host: 'app.example.com' } : { host: 'app.example.com' }, body: {} }, res);
    return res;
  };

  it("returns the caller's gym and how many of their clients are outside it", async () => {
    const res = await call('coach-token');
    expect(res.body).toEqual({ gym: { name: 'Test Gym', status: 'active', code: 'GYM-QFAP', isOwner: false }, clientsOutsideGym: 2 });
  });

  it('gym: null when not in a gym', async () => {
    gymIdOfCaller = null;
    const res = await call('coach-token');
    expect(res.body).toEqual({ gym: null, clientsOutsideGym: 2 });
  });

  it('401 without a session', async () => {
    expect((await call(null)).statusCode).toBe(401);
  });
});
