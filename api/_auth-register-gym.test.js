// "I own a gym" on Coach Sign Up: the coach account also gets an active gym
// it owns, the owner joins it, the admin alert says so, and a failed gym
// write on a fresh account rolls the auth account back like any other
// profile-write failure. Underscore-prefixed: never a Vercel function.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let writes;
let existingGyms;
let gymInsertError;
let createUserResult;
let deletedUsers;
let alerts;

const query = (table) => {
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: () => Promise.resolve({ data: table === 'gyms' ? existingGyms : [], error: null }),
    maybeSingle: () => Promise.resolve({ data: null }),
    upsert: (row) => { writes.push({ table, op: 'upsert', row }); return q; },
    insert: (row) => { writes.push({ table, op: 'insert', row }); return q; },
    update: (row) => { writes.push({ table, op: 'update', row }); return q; },
    is: (col, val) => { writes[writes.length - 1].onlyIf = { [col]: val }; return Promise.resolve({ error: null }); },
    single: () => {
      if (table === 'gyms') {
        return Promise.resolve(gymInsertError
          ? { data: null, error: { message: gymInsertError } }
          : { data: { id: 'gym-1', name: writes.at(-1).row.name, join_code: 'GYM-7X6P' }, error: null });
      }
      return Promise.resolve({ data: { id: `${table}-id` }, error: null });
    }
  };
  return q;
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: query,
    auth: {
      admin: {
        createUser: async () => createUserResult,
        deleteUser: async (id) => { deletedUsers.push(id); return {}; }
      },
      signInWithPassword: async () => ({ data: { user: { id: 'auth-1' }, session: null }, error: null }),
      getUser: async () => ({ data: { user: { email: 'owner@example.com' } }, error: null })
    }
  })
}));
vi.mock('./_adminAlert.js', () => ({ alertSuperAdmin: async (args) => { alerts.push(args); } }));

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.setHeader = () => {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
};

describe('api/auth-register — gym owner sign-up', () => {
  let handler;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    writes = [];
    existingGyms = [];
    gymInsertError = null;
    createUserResult = { data: { user: { id: 'auth-new' } }, error: null };
    deletedUsers = [];
    alerts = [];
    handler = (await import('./auth-register.js')).default;
  });

  afterEach(() => vi.unstubAllEnvs());

  const call = async (method, extra = {}) => {
    const res = mockRes();
    await handler({
      method: 'POST',
      query: { method },
      headers: { authorization: 'Bearer token' },
      body: { email: 'owner@example.com', name: 'Ravi', password: 'pw123456', location: 'Hyderabad', ...extra }
    }, res);
    return res;
  };

  it.each(['email', 'google'])('creates an active gym owned by the new account and joins it (%s)', async (method) => {
    const res = await call(method, { gymName: '  Iron   Den ' });
    expect(res.statusCode).toBe(200);
    expect(res.body.gym).toEqual({ id: 'gym-1', name: 'Iron Den', join_code: 'GYM-7X6P' });

    const gymInsert = writes.find(w => w.table === 'gyms');
    expect(gymInsert.row).toEqual({ name: 'Iron Den', owner_id: 'users-id', status: 'active' });

    const join = writes.find(w => w.table === 'users' && w.op === 'update');
    expect(join.row).toEqual({ gym_id: 'gym-1', gym_status: 'active' });
    expect(join.onlyIf).toEqual({ gym_id: null }); // never moves an owner out of another gym

    const coach = writes.find(w => w.table === 'coaches');
    expect(coach.row.brand_name).toBe('Iron Den'); // no specialization field for owners
    expect(writes.find(w => w.table === 'users' && w.op === 'upsert').row.role).toBe('coach');

    expect(alerts[0].title).toBe('🏢 New gym joined');
    expect(alerts[0].payload).toMatchObject({ gym_name: 'Iron Den', gym_id: 'gym-1' });
  });

  it('a plain coach sign-up creates no gym', async () => {
    const res = await call('email', { gymName: '' });
    expect(res.statusCode).toBe(200);
    expect(res.body.gym).toBeNull();
    expect(writes.some(w => w.table === 'gyms')).toBe(false);
    expect(alerts[0].title).toBe('🏅 New coach joined');
  });

  it('a retry reuses the gym the account already owns', async () => {
    existingGyms = [{ id: 'gym-old', name: 'Iron Den', join_code: 'GYM-AAAA' }];
    const res = await call('email', { gymName: 'Iron Den 2' });
    expect(res.statusCode).toBe(200);
    expect(res.body.gym.id).toBe('gym-old');
    expect(writes.some(w => w.table === 'gyms' && w.op === 'insert')).toBe(false);
  });

  it('rejects a bad gym name before touching anything', async () => {
    const res = await call('email', { gymName: 'x' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Gym name/);
    expect(writes).toEqual([]);
  });

  it('rolls back a freshly created auth account if the gym write fails', async () => {
    gymInsertError = 'boom';
    const res = await call('email', { gymName: 'Iron Den' });
    expect(res.statusCode).toBe(400);
    expect(deletedUsers).toEqual(['auth-new']);
    expect(alerts).toEqual([]);
  });
});
