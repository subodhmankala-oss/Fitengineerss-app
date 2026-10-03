// Coach sign-up must not turn an established client into a coach — login
// routes by role, so a coaches row silently locks the client out of their
// client app (testclient, 2026-10-03).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let clientRow;
let writes;

const query = (table) => {
  const q = {
    select: () => q, eq: () => q, limit: () => Promise.resolve({ data: clientRow && table === 'clients' ? [clientRow] : [] }),
    maybeSingle: () => Promise.resolve({ data: table === 'users' ? { id: 'user-1' } : null }),
    upsert: (row) => { writes.push({ table, row }); return q; },
    single: () => Promise.resolve({ data: { id: `${table}-id` }, error: null })
  };
  return q;
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: query,
    auth: {
      admin: { createUser: async () => ({ error: { status: 422, message: 'already registered' } }), deleteUser: async () => ({}) },
      signInWithPassword: async () => ({ data: { user: { id: 'auth-1' }, session: null }, error: null }),
      getUser: async () => ({ data: { user: { email: 'client@example.com' } }, error: null })
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

describe('api/auth-register — existing client accounts', () => {
  let handler;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    writes = [];
    clientRow = null;
    handler = (await import('./auth-register.js')).default;
  });

  afterEach(() => vi.unstubAllEnvs());

  const call = async (method) => {
    const res = mockRes();
    await handler({
      method: 'POST',
      query: { method },
      headers: { authorization: 'Bearer token' },
      body: { email: 'client@example.com', name: 'Client', password: 'pw' }
    }, res);
    return res;
  };

  it.each(['email', 'google'])('refuses a client who finished onboarding (%s)', async (method) => {
    clientRow = { onboarding_completed: true, coach_id: null };
    const res = await call(method);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/client account/i);
    expect(writes).toEqual([]);
  });

  it('refuses a client linked to a coach', async () => {
    clientRow = { onboarding_completed: false, coach_id: 'coach-9' };
    const res = await call('email');
    expect(res.statusCode).toBe(409);
    expect(writes).toEqual([]);
  });

  it('still lets a half-finished client profile become a coach', async () => {
    clientRow = { onboarding_completed: false, coach_id: null };
    const res = await call('email');
    expect(res.statusCode).toBe(200);
    expect(writes.map(w => w.table)).toEqual(['users', 'coaches']);
  });
});
