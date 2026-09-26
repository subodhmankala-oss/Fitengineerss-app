import { describe, it, expect, vi, afterEach } from 'vitest';
import { authorizeNotify } from '../../api/_notifyAuth.js';

const CLIENT = '11111111-1111-4111-8111-111111111111';
const COACH = '22222222-2222-4222-8222-222222222222';
const OTHER_COACH = '33333333-3333-4333-8333-333333333333';
const as = (id, extra = {}) => ({ id, email: `${id.slice(0, 4)}@x.com`, role: 'client', ...extra });
const check = (event, caller, clientCoachId = COACH) =>
  authorizeNotify({ event, caller, clientUserId: CLIENT, clientCoachId });

describe('authorizeNotify', () => {
  it('rejects anonymous callers (the hole: anyone could push a fake coach note)', () => {
    expect(check('coach_note', null)).toMatchObject({ ok: false, status: 401 });
  });

  it("lets only the client's own coach send coach→client notifications", () => {
    ['coach_note', 'monthly_report', 'session_reminder', 'renewal_reminder', 'plan_assigned', 'measurement_reminder_manual'].forEach(event => {
      expect(check(event, as(COACH, { role: 'coach' })).ok).toBe(true);
      expect(check(event, as(OTHER_COACH, { role: 'coach' }))).toMatchObject({ ok: false, status: 403 });
      expect(check(event, as(CLIENT))).toMatchObject({ ok: false, status: 403 });
    });
  });

  it('blocks coach→client notifications to an unattached client, except for the admin', () => {
    expect(check('coach_note', as(COACH, { role: 'coach' }), null).ok).toBe(false);
    expect(check('coach_note', as('44444444-4444-4444-8444-444444444444', { email: 'subodhmankala@gmail.com' }), null).ok).toBe(true);
  });

  it('lets only the client themself send client→coach notifications', () => {
    ['workout_started', 'measurements_saved', 'workout_finished', 'client_reply', 'client_disconnected', 'client_connected'].forEach(event => {
      expect(check(event, as(CLIENT)).ok).toBe(true);
      expect(check(event, as(COACH, { role: 'coach' }))).toMatchObject({ ok: false, status: 403 });
    });
  });

  it('lets either the client or their coach announce a custom exercise', () => {
    expect(check('custom_exercise_created', as(CLIENT)).ok).toBe(true);
    expect(check('custom_exercise_created', as(COACH, { role: 'coach' })).ok).toBe(true);
    expect(check('custom_exercise_created', as(OTHER_COACH, { role: 'coach' })).ok).toBe(false);
  });

  it('allows any super-admin role account', () => {
    expect(check('coach_note', as(OTHER_COACH, { role: 'super-admin' })).ok).toBe(true);
  });

  it('rejects unknown events for non-admins', () => {
    expect(check('anything_else', as(CLIENT)).ok).toBe(false);
  });
});

describe('notifyEvent sends the access token', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); vi.doUnmock('../services/databaseService'); });

  it('adds Authorization: Bearer <token> when signed in', async () => {
    vi.doMock('../services/databaseService', () => ({ resolveRealAccessToken: vi.fn().mockResolvedValue('tok123') }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const { notifyEvent } = await import('./pushNotify');
    notifyEvent('coach_note', { clientUserId: CLIENT, message: 'hi' });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/notify-user');
    expect(init.headers.Authorization).toBe('Bearer tok123');
    expect(JSON.parse(init.body)).toMatchObject({ event: 'coach_note', clientUserId: CLIENT, message: 'hi' });
  });

  it('never throws when there is no session', async () => {
    vi.doMock('../services/databaseService', () => ({ resolveRealAccessToken: vi.fn().mockResolvedValue(null) }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const { notifyEvent } = await import('./pushNotify');
    expect(() => notifyEvent('workout_finished', { clientUserId: CLIENT })).not.toThrow();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
});
