// Testimonials must really come from the client: the server takes the coach
// and the writer from the caller's own rows, never from the request, and
// only the coach can change a testimonial's status — never its words.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let rows; // table -> rows returned for any GET on it
let writes;

const json = (data, status = 200) => ({ ok: status < 300, status, json: async () => data, text: async () => JSON.stringify(data) });

const fakeFetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.pathname === '/auth/v1/user') return json({ email: 'caller@example.com' });
  const table = u.pathname.replace('/rest/v1/', '');
  const method = opts.method || 'GET';
  if (method === 'GET') return json(rows[table] || []);
  writes.push({ table, method, query: u.search, body: opts.body ? JSON.parse(opts.body) : null });
  return json(method === 'PATCH' ? [{ id: 't1' }] : null);
};

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.setHeader = () => {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
};

const call = async (handler, body) => {
  const res = mockRes();
  await handler({ method: 'POST', query: { action: 'testimonials' }, headers: { authorization: 'Bearer user-token' }, body }, res);
  return res;
};

describe('api/save-user-data — testimonials', () => {
  let handler;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
    writes = [];
    rows = { users: [{ id: 'client-1' }], clients: [{ coach_id: 'coach-1' }], coaches: [], coach_testimonials: [] };
    handler = (await import('./save-user-data.js')).default;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("saves under the caller's own coach, ignoring ids in the body, as pending", async () => {
    const res = await call(handler, { op: 'save', quote: ' Great coach ', coach_id: 'someone-else', client_user_id: 'x', status: 'shown' });
    expect(res.statusCode).toBe(200);
    const write = writes.find(w => w.table === 'coach_testimonials');
    expect(write.body).toMatchObject({ client_user_id: 'client-1', coach_id: 'coach-1', quote: 'Great coach', status: 'pending' });
  });

  it('refuses a client without a coach, and an empty quote', async () => {
    expect((await call(handler, { op: 'save', quote: '   ' })).statusCode).toBe(400);
    rows.clients = [{ coach_id: null }];
    expect((await call(handler, { op: 'save', quote: 'Hi' })).statusCode).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('lets only a coach change status, and only on their own rows', async () => {
    expect((await call(handler, { op: 'status', id: 't1', status: 'shown' })).statusCode).toBe(403);

    rows.users = [{ id: 'coach-1' }];
    rows.clients = [];
    rows.coaches = [{ id: 'c' }];
    expect((await call(handler, { op: 'status', id: 't1', status: 'pending' })).statusCode).toBe(400);
    const res = await call(handler, { op: 'status', id: 't1', status: 'shown', quote: 'rewritten' });
    expect(res.statusCode).toBe(200);
    const patch = writes.find(w => w.method === 'PATCH');
    expect(patch.query).toContain('coach_id=eq.coach-1');
    expect(patch.body).toEqual({ status: 'shown' });
  });

  it('lets only a coach save a Google review link, and only a Google one', async () => {
    expect((await call(handler, { op: 'google-link', url: 'https://g.page/r/abc/review' })).statusCode).toBe(403);

    rows.users = [{ id: 'coach-1' }];
    rows.clients = [];
    rows.coaches = [{ id: 'c' }];
    expect((await call(handler, { op: 'google-link', url: 'https://evil.example/review' })).statusCode).toBe(400);
    expect(writes).toHaveLength(0);

    expect((await call(handler, { op: 'google-link', url: 'g.page/r/abc/review' })).statusCode).toBe(200);
    const patch = writes.find(w => w.table === 'coaches');
    expect(patch.query).toContain('user_id=eq.coach-1');
    expect(patch.body).toEqual({ google_review_url: 'https://g.page/r/abc/review' });

    await call(handler, { op: 'google-link', url: '' });
    expect(writes.at(-1).body).toEqual({ google_review_url: null });
  });

  it('shows other clients only a first name and last initial', async () => {
    rows.coach_testimonials = [
      { id: 't1', client_user_id: 'client-2', quote: 'Q', result: null, status: 'shown', client: { full_name: 'Priya Sharma' } },
    ];
    const res = await call(handler, { op: 'list' });
    expect(res.body.shown[0].clientName).toBe('Priya S.');
    expect(res.body.mine).toBeNull();
  });
});
