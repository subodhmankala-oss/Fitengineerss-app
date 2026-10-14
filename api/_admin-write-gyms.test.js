// create-gym / update-gym: super-admin only (identity from the verified
// token, never the body), input validation, and owner lookup by email.
// Underscore-prefixed so Vercel never counts it as a function (12-function cap).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ADMIN_ID = 'admin-uuid';
const OWNER_ID = 'owner-uuid';
const GYM_ID = '11111111-2222-3333-4444-555555555555';
const EMAILS = { 'admin-token': 'subodhmankala@gmail.com', 'coach-token': 'coach@example.com' };
const IDS = { 'subodhmankala@gmail.com': ADMIN_ID, 'coach@example.com': 'coach-uuid', 'owner@example.com': OWNER_ID };

const mockRes = () => {
  const res = { statusCode: 200, body: null, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
};

describe('api/admin-write — gyms', () => {
  let handler;
  let writes;
  let existingApprovedAt;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    writes = [];
    existingApprovedAt = null;
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = decodeURIComponent(String(url));
      const ok = (body) => ({ ok: true, status: 200, json: async () => body });
      if (u.includes('/auth/v1/user')) {
        const token = (opts.headers?.Authorization || '').replace('Bearer ', '');
        return EMAILS[token] ? ok({ email: EMAILS[token] }) : { ok: false, status: 401, json: async () => ({}) };
      }
      if (u.includes('/rest/v1/users?email=ilike.')) {
        const email = u.split('email=ilike.')[1].split('&')[0];
        return ok(IDS[email] ? [{ id: IDS[email] }] : []);
      }
      if (u.includes('/rest/v1/gyms')) {
        const method = opts.method || 'GET';
        if (method === 'GET') return ok([{ approved_at: existingApprovedAt }]);
        const body = JSON.parse(opts.body);
        writes.push({ method, url: u, body });
        return ok([{ id: GYM_ID, ...body }]);
      }
      return ok([]);
    });
    handler = (await import('./admin-write.js')).default;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const call = async (action, token, body) => {
    const res = mockRes();
    await handler({
      method: 'POST',
      query: { action },
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body
    }, res);
    return res;
  };

  it('rejects non-admins and anonymous callers, even if the body claims the admin email', async () => {
    expect((await call('create-gym', 'coach-token', { name: 'Iron Den', email: 'subodhmankala@gmail.com' })).statusCode).toBe(403);
    expect((await call('create-gym', null, { name: 'Iron Den' })).statusCode).toBe(403);
    expect((await call('update-gym', 'coach-token', { gymId: GYM_ID, status: 'active' })).statusCode).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('creates an active, approved gym with the owner resolved by email', async () => {
    const res = await call('create-gym', 'admin-token', { name: '  Iron   Den ', ownerEmail: 'Owner@Example.com' });
    expect(res.statusCode).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe('POST');
    expect(writes[0].body).toMatchObject({ name: 'Iron Den', owner_id: OWNER_ID, status: 'active' });
    expect(writes[0].body.approved_at).toBeTruthy();
  });

  it('creates a gym with no owner when ownerEmail is blank', async () => {
    const res = await call('create-gym', 'admin-token', { name: 'Iron Den', ownerEmail: '' });
    expect(res.statusCode).toBe(200);
    expect(writes[0].body.owner_id).toBeNull();
  });

  it('404s an unknown owner and 400s a wildcard email without writing', async () => {
    expect((await call('create-gym', 'admin-token', { name: 'Iron Den', ownerEmail: 'nobody@example.com' })).statusCode).toBe(404);
    expect((await call('create-gym', 'admin-token', { name: 'Iron Den', ownerEmail: '%@example.com' })).statusCode).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it('validates the name', async () => {
    expect((await call('create-gym', 'admin-token', { name: ' x ' })).statusCode).toBe(400);
    expect((await call('create-gym', 'admin-token', { name: 'x'.repeat(81) })).statusCode).toBe(400);
  });

  it('stamps approved_at on first activation only', async () => {
    await call('update-gym', 'admin-token', { gymId: GYM_ID, status: 'active' });
    expect(writes[0].body.approved_at).toBeTruthy();

    existingApprovedAt = '2026-10-01T00:00:00Z';
    await call('update-gym', 'admin-token', { gymId: GYM_ID, status: 'active' });
    expect(writes[1].body).toEqual({ status: 'active' });
  });

  it('suspends, removes the owner with a blank email, and rejects bad input', async () => {
    expect((await call('update-gym', 'admin-token', { gymId: GYM_ID, status: 'suspended' })).statusCode).toBe(200);
    expect(writes[0].body).toEqual({ status: 'suspended' });

    expect((await call('update-gym', 'admin-token', { gymId: GYM_ID, ownerEmail: '' })).statusCode).toBe(200);
    expect(writes[1].body).toEqual({ owner_id: null });

    expect((await call('update-gym', 'admin-token', { gymId: GYM_ID, status: 'deleted' })).statusCode).toBe(400);
    expect((await call('update-gym', 'admin-token', { gymId: 'not-a-uuid', status: 'active' })).statusCode).toBe(400);
    expect((await call('update-gym', 'admin-token', { gymId: GYM_ID })).statusCode).toBe(400);
    expect(writes).toHaveLength(2);
  });
});
