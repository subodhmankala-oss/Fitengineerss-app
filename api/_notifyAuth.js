// Who may trigger each /api/notify-user event. Underscore-prefixed so Vercel
// doesn't deploy it as its own function; imported by api/push.js.
//
// Until 2026-09-26 notify-user checked nothing about the caller — anyone on
// the internet could POST a client's id and push them any text as a
// "coach_note" titled with their coach's name. Every event now needs a
// verified caller (see push.js's resolveCaller) in the right role for the
// direction the notification travels.

export const SUPER_ADMIN_EMAIL = 'subodhmankala@gmail.com';

// Sent by the client about themself (the recipient is their coach or an
// admin), so the caller must BE that client.
const FROM_CLIENT_EVENTS = new Set([
  'workout_started',
  'measurements_saved',
  'workout_finished',
  'client_reply',
  'client_disconnected',
  'client_connected',
  'new_client_signup'
]);

// Sent by the client's coach to the client, so the caller must be the coach
// currently attached to that client.
const FROM_COACH_EVENTS = new Set([
  'coach_note',
  'monthly_report',
  'session_reminder',
  'renewal_reminder',
  'plan_assigned',
  'measurement_reminder_manual'
]);

// Either side can create a custom exercise for this client.
const FROM_CLIENT_OR_COACH_EVENTS = new Set(['custom_exercise_created']);

export function isSuperAdmin(caller) {
  return !!caller && (caller.email === SUPER_ADMIN_EMAIL || caller.role === 'super-admin');
}

// caller: { email, id, role } | null. clientCoachId: the client's current
// clients.coach_id (null when unattached). Returns { ok: true } or
// { ok: false, status, error }.
export function authorizeNotify({ event, caller, clientUserId, clientCoachId }) {
  if (!caller) return { ok: false, status: 401, error: 'Sign in to send notifications.' };
  if (isSuperAdmin(caller)) return { ok: true };

  const isClient = !!caller.id && caller.id === clientUserId;
  const isClientsCoach = !!caller.id && !!clientCoachId && caller.id === clientCoachId;

  if (FROM_CLIENT_EVENTS.has(event) && isClient) return { ok: true };
  if (FROM_COACH_EVENTS.has(event) && isClientsCoach) return { ok: true };
  if (FROM_CLIENT_OR_COACH_EVENTS.has(event) && (isClient || isClientsCoach)) return { ok: true };

  return { ok: false, status: 403, error: 'You are not allowed to send this notification.' };
}
