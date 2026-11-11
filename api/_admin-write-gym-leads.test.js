// gym-lead with the Lost stage, lost reason and follow-up date
// (sql/gym_leads_lost.sql). Underscore-prefixed so Vercel never counts it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const OWNER_ID = 'owner-uuid';
const LEAD = '11111111-2222-3333-4444-555555555555';

const mockRes = () => {
  const res = { statusCode: 200, body: null, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
};

describe('api/admin-write: gym-lead lost + follow-up', () => {
  let handler;
  let rpcs;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    rpcs = [];
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = decodeURIComponent(String(url));
      const ok = (body) => ({ ok: true, status: 200, json: async () => body });
      if (u.includes('/auth/v1/user')) return ok({ email: 'owner@example.com' });
      if (u.includes('/rest/v1/users?email=ilike.')) return ok([{ id: OWNER_ID, email: 'owner@example.com', role: 'coach' }]);
      if (u.includes('/rest/v1/rpc/')) {
        rpcs.push({ fn: u.split('/rpc/')[1], body: JSON.parse(opts.body) });
        return ok({ success: true });
      }
      return ok([]);
    });
    handler = (await import('./admin-write.js')).default;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const call = async (body) => {
    const res = mockRes();
    await handler({ method: 'POST', query: { action: 'gym-lead' }, headers: { authorization: 'Bearer owner-token' }, body }, res);
    return res;
  };

  it('marks a lead lost with a reason', async () => {
    const res = await call({ op: 'move', leadId: LEAD, stage: 'lost', reason: 'too_expensive' });
    expect(res.statusCode).toBe(200);
    expect(rpcs[0].fn).toBe('gym_lead_action');
    expect(rpcs[0].body).toMatchObject({ p_owner_id: OWNER_ID, p_op: 'move', p_lead_id: LEAD, p_stage: 'lost', p_lost_reason: 'too_expensive' });
  });

  it('refuses lost without a valid reason', async () => {
    expect((await call({ op: 'move', leadId: LEAD, stage: 'lost' })).statusCode).toBe(400);
    expect((await call({ op: 'move', leadId: LEAD, stage: 'lost', reason: 'bored' })).statusCode).toBe(400);
    expect(rpcs).toHaveLength(0);
  });

  it('does not send the new arguments for an ordinary move', async () => {
    await call({ op: 'move', leadId: LEAD, stage: 'trial_done' });
    expect(Object.keys(rpcs[0].body)).not.toContain('p_lost_reason');
    expect(Object.keys(rpcs[0].body)).not.toContain('p_follow_up_on');
  });

  it('sets and clears a follow-up day, rejecting impossible dates', async () => {
    await call({ op: 'follow_up', leadId: LEAD, followUpOn: '2026-11-14' });
    await call({ op: 'follow_up', leadId: LEAD, followUpOn: null });
    expect(rpcs[0].body).toMatchObject({ p_op: 'follow_up', p_follow_up_on: '2026-11-14' });
    expect(rpcs[1].body.p_follow_up_on).toBeNull();
    expect((await call({ op: 'follow_up', leadId: LEAD, followUpOn: '2026-02-31' })).statusCode).toBe(400);
    expect((await call({ op: 'follow_up', leadId: LEAD, followUpOn: 'tomorrow' })).statusCode).toBe(400);
  });

  it('accepts a follow-up day when adding an enquiry', async () => {
    await call({ op: 'add', name: 'Meera', source: 'instagram', followUpOn: '2026-11-15' });
    expect(rpcs[0].body).toMatchObject({ p_op: 'add', p_name: 'Meera', p_follow_up_on: '2026-11-15' });
  });
});
