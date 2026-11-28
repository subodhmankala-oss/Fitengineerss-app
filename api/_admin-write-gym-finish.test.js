// gym-save-upi and gym-message-sent (sql/gym_owner_finish.sql): the verified
// caller is always the owner, input is validated before the database is called.
// Underscore-prefixed so Vercel never counts it as a function.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const OWNER_ID = 'owner-uuid';
const MEMBER = '11111111-2222-3333-4444-555555555555';

const mockRes = () => {
  const res = { statusCode: 200, body: null, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => res;
  return res;
};

describe('api/admin-write: gym UPI id and sent messages', () => {
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
      if (u.includes('/auth/v1/user')) {
        return (opts.headers?.Authorization || '') === 'Bearer owner-token' ? ok({ email: 'owner@example.com' }) : { ok: false, status: 401, json: async () => ({}) };
      }
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

  const call = async (action, body, token = 'owner-token') => {
    const res = mockRes();
    await handler({ method: 'POST', query: { action }, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
    return res;
  };

  it('saves a valid UPI id for the verified caller, trimmed', async () => {
    const res = await call('gym-save-upi', { upiId: '  irondenfit@okhdfcbank ', ownerId: 'someone-else' });
    expect(res.statusCode).toBe(200);
    expect(rpcs).toEqual([{ fn: 'gym_save_upi', body: { p_owner_id: OWNER_ID, p_upi_id: 'irondenfit@okhdfcbank' } }]);
  });

  it('clears the UPI id when blank, and rejects a malformed one without calling the database', async () => {
    expect((await call('gym-save-upi', { upiId: '' })).statusCode).toBe(200);
    expect(rpcs[0].body.p_upi_id).toBeNull();
    rpcs.length = 0;
    for (const bad of ['no-at-sign', 'a b@ybl', 'x@1bank', 'a'.repeat(80) + '@ybl', 42]) {
      expect((await call('gym-save-upi', { upiId: bad })).statusCode).toBe(400);
    }
    expect(rpcs).toHaveLength(0);
  });

  it('rejects anonymous callers', async () => {
    expect((await call('gym-save-upi', { upiId: 'a.b@ybl' }, null)).statusCode).toBe(401);
    expect((await call('gym-message-sent', { memberId: MEMBER, kind: 'miss', ref: '2026-11-01' }, null)).statusCode).toBe(401);
    expect(rpcs).toHaveLength(0);
  });

  it('records a message as sent (default) or skipped', async () => {
    expect((await call('gym-message-sent', { memberId: MEMBER, kind: 'miss', ref: '2026-11-01' })).statusCode).toBe(200);
    expect((await call('gym-message-sent', { memberId: MEMBER, kind: 'renewal', ref: '2026-11-12', action: 'skipped' })).statusCode).toBe(200);
    expect(rpcs).toEqual([
      { fn: 'gym_message_sent', body: { p_owner_id: OWNER_ID, p_member_id: MEMBER, p_kind: 'miss', p_ref: '2026-11-01', p_action: 'sent' } },
      { fn: 'gym_message_sent', body: { p_owner_id: OWNER_ID, p_member_id: MEMBER, p_kind: 'renewal', p_ref: '2026-11-12', p_action: 'skipped' } }
    ]);
  });

  it('validates the member, kind, reference and action', async () => {
    const good = { memberId: MEMBER, kind: 'receipt', ref: 'p1' };
    for (const bad of [{ ...good, memberId: 'nope' }, { ...good, kind: 'birthday' }, { ...good, ref: '' }, { ...good, ref: 'x'.repeat(65) }, { ...good, action: 'deleted' }, { ...good, ref: 5 }]) {
      expect((await call('gym-message-sent', bad)).statusCode).toBe(400);
    }
    expect(rpcs).toHaveLength(0);
  });

  it('freezes a plan for the verified caller and validates days / reason first', async () => {
    const res = await call('gym-freeze-membership', { memberId: MEMBER, days: 15, reason: 'travel', ownerId: 'someone-else' });
    expect(res.statusCode).toBe(200);
    expect(rpcs).toEqual([{ fn: 'gym_freeze_membership', body: { p_owner_id: OWNER_ID, p_member_id: MEMBER, p_days: 15, p_reason: 'travel', p_starts_on: null } }]);
    rpcs.length = 0;
    for (const bad of [{ memberId: MEMBER, days: 0 }, { memberId: MEMBER, days: 91 }, { memberId: MEMBER, days: 7, reason: 'party' }, { memberId: 'x', days: 7 }, { memberId: MEMBER, days: 7, startsOn: 'soon' }]) {
      expect((await call('gym-freeze-membership', bad)).statusCode).toBe(400);
    }
    expect(rpcs).toHaveLength(0);
  });

  it('ends a freeze by id', async () => {
    expect((await call('gym-end-freeze', { freezeId: MEMBER })).statusCode).toBe(200);
    expect(rpcs).toEqual([{ fn: 'gym_end_freeze', body: { p_owner_id: OWNER_ID, p_freeze_id: MEMBER } }]);
    expect((await call('gym-end-freeze', { freezeId: 'nope' })).statusCode).toBe(400);
  });

  it('adds, stops and deletes expenses for the verified caller only', async () => {
    expect((await call('gym-expense', { op: 'add', category: 'rent', amountInr: 80000, spentOn: '2026-11-01', note: ' Shop ', monthly: true, ownerId: 'x' })).statusCode).toBe(200);
    expect(rpcs[0]).toEqual({ fn: 'gym_expense_action', body: { p_owner_id: OWNER_ID, p_op: 'add', p_expense_id: null, p_category: 'rent', p_amount_inr: 80000, p_spent_on: '2026-11-01', p_note: 'Shop', p_monthly: true } });
    expect((await call('gym-expense', { op: 'stop', expenseId: MEMBER })).statusCode).toBe(200);
    expect((await call('gym-expense', { op: 'delete', expenseId: MEMBER })).statusCode).toBe(200);
    expect(rpcs.map((r) => r.body.p_op)).toEqual(['add', 'stop', 'delete']);
    rpcs.length = 0;
    for (const bad of [
      { op: 'add', category: 'party', amountInr: 10, spentOn: '2026-11-01' },
      { op: 'add', category: 'rent', amountInr: 0, spentOn: '2026-11-01' },
      { op: 'add', category: 'rent', amountInr: 10, spentOn: 'today' },
      { op: 'add', category: 'rent', amountInr: 10, spentOn: '2026-11-01', note: 'x'.repeat(81) },
      { op: 'delete', expenseId: 'nope' },
      { op: 'edit', expenseId: MEMBER }
    ]) {
      expect((await call('gym-expense', bad)).statusCode).toBe(400);
    }
    expect(rpcs).toHaveLength(0);
    expect((await call('gym-expense', { op: 'delete', expenseId: MEMBER }, null)).statusCode).toBe(401);
  });
});
