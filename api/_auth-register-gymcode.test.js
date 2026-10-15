// Optional "Gym code" on Coach Sign Up: a wrong code is a plain form error
// BEFORE any account is created; a right one joins via coach_join_gym; an
// owner sign-up ignores the code. Underscore-prefixed: never a Vercel function.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let writes;
let createUserCalls;
let rpcCalls;
let gymsByCode;

const query = (table) => {
  let eqCol = null;
  let eqVal = null;
  const q = {
    select: () => q,
    eq: (col, val) => { eqCol = col; eqVal = val; return q; },
    order: () => q,
    is: () => Promise.resolve({ error: null }),
    limit: () => Promise.resolve({
      data: table === 'gyms' && eqCol === 'join_code' ? (gymsByCode[eqVal] ? [gymsByCode[eqVal]] : []) : [],
      error: null
    }),
    maybeSingle: () => Promise.resolve({ data: null }),
    upsert: (row) => { writes.push({ table, row }); return q; },
    insert: (row) => { writes.push({ table, row }); return q; },
    update: (row) => { writes.push({ table, row }); return q; },
    single: () => Promise.resolve({ data: { id: `${table}-id`, name: 'Owned Gym', join_code: 'GYM-OWN1' }, error: null })
  };
  return q;
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: query,
    rpc: async (fn, args) => { rpcCalls.push({ fn, args }); return { data: { success: true, gym_id: 'g1', gym_name: 'Test Gym' }, error: null }; },
    auth: {
      admin: {
        createUser: async () => { createUserCalls += 1; return { data: { user: { id: 'auth-new' } }, error: null }; },
        deleteUser: async () => ({})
      },
      signInWithPassword: async () => ({ data: { user: { id: 'auth-1' }, session: null }, error: null }),
      getUser: async () => ({ data: { user: { email: 'trainer@example.com' } }, error: null })
    }
  })
}));
vi.mock('./_adminAlert.js', () => ({ alertSuperAdmin: async () => {} }));

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.setHeader = () => {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
};

describe('api/auth-register — gym code', () => {
  let handler;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    writes = [];
    createUserCalls = 0;
    rpcCalls = [];
    gymsByCode = { 'GYM-QFAP': { id: 'g1', status: 'active' }, 'GYM-SUSP': { id: 'g2', status: 'suspended' } };
    handler = (await import('./auth-register.js')).default;
  });

  afterEach(() => vi.unstubAllEnvs());

  const call = async (method, extra = {}) => {
    const res = mockRes();
    await handler({
      method: 'POST',
      query: { method },
      headers: { authorization: 'Bearer token' },
      body: { email: 'trainer@example.com', name: 'Asha', password: 'pw123456', ...extra }
    }, res);
    return res;
  };

  it.each(['email', 'google'])('joins the gym with a valid code, normalised (%s)', async (method) => {
    const res = await call(method, { gymCode: ' qfap ' });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls).toEqual([{ fn: 'coach_join_gym', args: { p_coach_id: 'users-id', p_code: 'GYM-QFAP', p_bring_clients: false } }]);
    expect(res.body.gym).toEqual({ id: 'g1', name: 'Test Gym' });
  });

  it('a wrong code fails before any account is created', async () => {
    const res = await call('email', { gymCode: 'GYM-ZZZZ' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/No gym found/);
    expect(createUserCalls).toBe(0);
    expect(writes).toEqual([]);
  });

  it('a suspended gym fails before any account is created', async () => {
    const res = await call('email', { gymCode: 'GYM-SUSP' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/isn't active/);
    expect(createUserCalls).toBe(0);
  });

  it('no code = plain coach sign-up', async () => {
    const res = await call('email', {});
    expect(res.statusCode).toBe(200);
    expect(rpcCalls).toEqual([]);
  });

  it('an owner sign-up ignores a gym code', async () => {
    const res = await call('email', { gymName: 'Iron Den', gymCode: 'GYM-QFAP' });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls).toEqual([]);
  });
});
