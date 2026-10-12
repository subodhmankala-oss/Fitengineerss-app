// A client's own in-progress session ('self') and their coach's Live Log
// ('coach') are separate workout_drafts rows. This endpoint must upsert on
// (user_id, source) and only let each side write its own row.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const CLIENT_ID = 'client-uuid';
const COACH_ID = 'coach-uuid';
const EMAILS = { 'client-token': 'client@example.com', 'coach-token': 'coach@example.com' };
const IDS = { 'client@example.com': CLIENT_ID, 'coach@example.com': COACH_ID };

const mockRes = () => {
  const res = { statusCode: 200, body: null, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
};

describe('api/save-workout-draft — per-source drafts', () => {
  let handler;
  let upserts;
  let clientHasOpenSession;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    upserts = [];
    clientHasOpenSession = false;
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = decodeURIComponent(String(url));
      const ok = (body) => ({ ok: true, status: 200, json: async () => body });
      if (u.includes('/rest/v1/clients?')) return ok([{ coach_id: COACH_ID }]);
      if (u.includes('/auth/v1/user')) {
        const token = (opts.headers?.Authorization || '').replace('Bearer ', '');
        return EMAILS[token] ? ok({ email: EMAILS[token] }) : { ok: false, status: 401, json: async () => ({}) };
      }
      if (u.includes('/rest/v1/users?email=ilike.')) {
        const email = u.split('email=ilike.')[1].split('&')[0];
        return ok(IDS[email] ? [{ id: IDS[email] }] : []);
      }
      if (u.includes('/rest/v1/workout_drafts')) {
        if (!u.includes('on_conflict') && clientHasOpenSession) return { ok: false, status: 409, json: async () => ({ code: '23505' }) };
        upserts.push({ url: u, record: JSON.parse(opts.body) });
        return ok(null);
      }
      return ok([]);
    });
    handler = (await import('./save-workout-draft.js')).default;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const call = async (token, source, extra = {}) => {
    const res = mockRes();
    await handler({
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, host: 'app.example.com' },
      body: { record: { user_id: CLIENT_ID, source, exercises: [] }, ...extra }
    }, res);
    return res;
  };

  it('lets the client write their own session and the coach their Live Log, on (user_id, source)', async () => {
    expect((await call('client-token', 'self')).statusCode).toBe(200);
    expect((await call('coach-token', 'coach')).statusCode).toBe(200);
    expect(upserts).toHaveLength(2);
    upserts.forEach(u => expect(u.url).toContain('on_conflict=user_id,source'));
  });

  it('rejects a coach writing the client’s own session, and the client writing the coach’s', async () => {
    expect((await call('coach-token', 'self')).statusCode).toBe(403);
    expect((await call('client-token', 'coach')).statusCode).toBe(403);
    expect(upserts).toHaveLength(0);
  });

  it('rejects an unknown source', async () => {
    expect((await call('client-token', 'other')).statusCode).toBe(400);
    expect(upserts).toHaveLength(0);
  });

  it('lets the coach hand their Live Log over as the client’s own session, insert-only', async () => {
    expect((await call('coach-token', 'self', { handover: true })).statusCode).toBe(200);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].url).not.toContain('on_conflict');
    expect(upserts[0].record.source).toBe('self');
  });

  it('never replaces a session the client already has open on handover', async () => {
    clientHasOpenSession = true;
    const res = await call('coach-token', 'self', { handover: true });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('client_session_open');
    expect(upserts).toHaveLength(0);
  });

  it('rejects a handover from anyone but the client’s coach, or as the coach row', async () => {
    expect((await call('client-token', 'self', { handover: true })).statusCode).toBe(403);
    expect((await call('coach-token', 'coach', { handover: true })).statusCode).toBe(403);
    expect(upserts).toHaveLength(0);
  });
});
