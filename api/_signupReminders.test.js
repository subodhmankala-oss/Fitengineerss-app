// "Finish setting up" reminders: max 3, first at the next slot ≥1h after
// sign-up, follow-ups only at 11:00 IST ≥12h apart, never for finished or
// long-abandoned sign-ups, and never counted when nothing was delivered.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reminderDue, reminderCopy, istHourOf, runFinishSignupReminders, REMINDER_EVENT } from './_signupReminders.js';

const HOUR = 60 * 60 * 1000;
// 05:30 UTC = 11:00 IST (the follow-up slot); 13:30 UTC = 19:00 IST.
const AT_11_IST = Date.parse('2026-10-03T05:30:00Z');
const AT_19_IST = Date.parse('2026-10-03T13:30:00Z');
const ago = (now, ms) => new Date(now - ms).toISOString();

describe('reminderDue', () => {
  it('maps cron slots to IST hours', () => {
    expect(istHourOf(AT_11_IST)).toBe(11);
    expect(istHourOf(AT_19_IST)).toBe(19);
    expect(istHourOf(Date.parse('2026-10-03T02:30:00Z'))).toBe(8);
  });

  it('first reminder at any slot once they are ≥1h in, within 3 days', () => {
    expect(reminderDue({ createdAt: ago(AT_19_IST, 30 * 60 * 1000), now: AT_19_IST })).toBe(false);
    expect(reminderDue({ createdAt: ago(AT_19_IST, 2 * HOUR), now: AT_19_IST })).toBe(true);
    expect(reminderDue({ createdAt: ago(AT_19_IST, 4 * 24 * HOUR), now: AT_19_IST })).toBe(false);
  });

  it('follow-ups only at the 11:00 IST slot and ≥12h after the last one', () => {
    const created = ago(AT_11_IST, 30 * HOUR);
    expect(reminderDue({ createdAt: created, sentTimes: [AT_11_IST - 22 * HOUR], now: AT_11_IST })).toBe(true);
    // #1 at 19:00 yesterday → #2 at 11:00 today (16h later).
    expect(reminderDue({ createdAt: created, sentTimes: [AT_11_IST - 16 * HOUR], now: AT_11_IST })).toBe(true);
    // #1 at 08:00 today → not again at 11:00 today.
    expect(reminderDue({ createdAt: created, sentTimes: [AT_11_IST - 3 * HOUR], now: AT_11_IST })).toBe(false);
    expect(reminderDue({ createdAt: created, sentTimes: [AT_19_IST - 30 * HOUR], now: AT_19_IST })).toBe(false);
  });

  it('stops after 3', () => {
    const sent = [AT_11_IST - 70 * HOUR, AT_11_IST - 48 * HOUR, AT_11_IST - 24 * HOUR];
    expect(reminderDue({ createdAt: ago(AT_11_IST, 80 * HOUR), sentTimes: sent, now: AT_11_IST })).toBe(false);
  });

  it('the last reminder says it is the last', () => {
    expect(reminderCopy('Rahul', 1).lines[0]).toBe('Hi Rahul,');
    expect(reminderCopy(null, 3).subject).toMatch(/Last reminder/);
  });
});

describe('runFinishSignupReminders', () => {
  let calls;
  let logRows;
  const now = AT_19_IST;
  const clients = [
    { user_id: 'stuck', full_name: 'Rahul Naik', onboarding_completed: false, created_at: ago(now, 5 * HOUR) },
    { user_id: 'done', full_name: 'Anusha', onboarding_completed: true, created_at: ago(now, 5 * HOUR) }
  ];
  const users = [{ id: 'stuck', email: 'rahul@example.com' }, { id: 'done', email: 'anusha@example.com' }];
  const ARGS = { supabaseUrl: 'https://placeholder.supabase.co', serviceKey: 'service-key', clients, users, now };

  beforeEach(() => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    vi.stubEnv('RESEND_API_KEY', 'resend-key');
    calls = [];
    logRows = [];
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
      if (u.includes('api.resend.com')) return { ok: true, json: async () => ({ id: 'email-1' }) };
      if (u.includes('/push_log?')) return { ok: true, json: async () => logRows };
      return { ok: true, json: async () => [] };
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('emails only the unfinished client and logs reminder 1/3', async () => {
    const r = await runFinishSignupReminders(ARGS);
    expect(r).toMatchObject({ due: 1, sent: 1 });
    const email = calls.find(c => c.url.includes('api.resend.com'));
    expect(email.body.to).toEqual(['rahul@example.com']);
    expect(email.body.html).toContain('Hi Rahul,');
    const log = calls.find(c => c.method === 'POST' && c.url.endsWith('/push_log'));
    expect(log.body).toMatchObject({ event: REMINDER_EVENT, target_user_id: 'stuck', body: 'Reminder 1/3 · emailed' });
  });

  it('does not send again in the same day', async () => {
    logRows = [{ target_user_id: 'stuck', created_at: ago(now, 3 * HOUR) }];
    const r = await runFinishSignupReminders(ARGS);
    expect(r).toMatchObject({ due: 0, sent: 0 });
    expect(calls.some(c => c.url.includes('api.resend.com'))).toBe(false);
  });

  it('does not count a reminder nothing could deliver', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const r = await runFinishSignupReminders(ARGS);
    expect(r).toMatchObject({ due: 1, sent: 0 });
    expect(calls.some(c => c.method === 'POST' && c.url.endsWith('/push_log'))).toBe(false);
  });

  it('skips the run if it cannot read who was already reminded', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    const r = await runFinishSignupReminders(ARGS);
    expect(r).toMatchObject({ sent: 0, error: 'log_read_failed' });
  });
});
