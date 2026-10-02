// Super-admin sign-up alerts: one per (type, person), never to the admin
// about themself, in-app row written even when push can't be sent.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { alertSuperAdmin, findIncompleteSignups, hoursAgoLabel } from './_adminAlert.js';

const ADMIN_ID = 'admin-uuid';
const ARGS = { supabaseUrl: 'https://placeholder.supabase.co', serviceKey: 'service-key' };
const HOUR = 60 * 60 * 1000;

describe('alertSuperAdmin', () => {
  let calls;
  let existingRows;

  beforeEach(() => {
    // No VAPID keys (like a preview deploy) — push is skipped, row still written.
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    calls = [];
    existingRows = [];
    global.fetch = vi.fn(async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
      if (String(url).includes('/users?')) return { ok: true, json: async () => [{ id: ADMIN_ID }] };
      if (String(url).includes('/notifications?')) return { ok: true, json: async () => existingRows };
      return { ok: true, json: async () => [] };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const send = (over = {}) => alertSuperAdmin({
    ...ARGS,
    type: 'new_client_signup',
    actorUserId: 'client-uuid',
    title: '🎉 New client joined',
    body: 'Anusha just signed up on Fitengineers — no coach yet.',
    url: '/?viewClient=client-uuid',
    ...over
  });

  it('writes the in-app notification row for the super-admin', async () => {
    const r = await send();
    expect(r.alerted).toBe(true);
    const insert = calls.find(c => c.method === 'POST' && c.url.endsWith('/notifications'));
    expect(insert.body).toMatchObject({
      recipient_user_id: ADMIN_ID,
      type: 'new_client_signup',
      actor_user_id: 'client-uuid',
      payload: { url: '/?viewClient=client-uuid', title: '🎉 New client joined' }
    });
  });

  it('skips when this person was already alerted for this type', async () => {
    existingRows = [{ id: 'n1' }];
    const r = await send();
    expect(r).toMatchObject({ alerted: false, reason: 'duplicate' });
    expect(calls.some(c => c.method === 'POST')).toBe(false);
  });

  it('never alerts the super-admin about their own account', async () => {
    const r = await send({ type: 'new_coach_signup', actorUserId: ADMIN_ID });
    expect(r).toMatchObject({ alerted: false, reason: 'self' });
    expect(calls.some(c => c.method === 'POST')).toBe(false);
  });

  it('never throws, even when the network fails', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline'); });
    await expect(send()).resolves.toMatchObject({ alerted: false });
  });
});

describe('findIncompleteSignups', () => {
  const now = Date.parse('2026-10-02T12:00:00Z');
  const at = (msAgo) => new Date(now - msAgo).toISOString();

  it('picks clients 1h–3d old who never finished onboarding', () => {
    const clients = [
      { user_id: 'stuck', onboarding_completed: false, created_at: at(5 * HOUR) },
      { user_id: 'done', onboarding_completed: true, created_at: at(5 * HOUR) },
      { user_id: 'too-new', onboarding_completed: false, created_at: at(10 * 60 * 1000) },
      { user_id: 'too-old', onboarding_completed: false, created_at: at(4 * 24 * HOUR) },
      { user_id: null, onboarding_completed: false, created_at: at(5 * HOUR) }
    ];
    expect(findIncompleteSignups(clients, now).map(c => c.user_id)).toEqual(['stuck']);
  });

  it('labels how long ago they signed up', () => {
    expect(hoursAgoLabel(at(5 * HOUR), now)).toBe('5h ago');
    expect(hoursAgoLabel(at(30 * HOUR), now)).toBe('1 day ago');
    expect(hoursAgoLabel(at(50 * HOUR), now)).toBe('2 days ago');
  });
});
