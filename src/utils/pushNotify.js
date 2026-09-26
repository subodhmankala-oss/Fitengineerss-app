import { resolveRealAccessToken } from '../services/databaseService';

// Fire-and-forget trigger for a targeted cross-user push notification.
// Posts to the Vercel /api/notify-user backend, which resolves the correct
// recipient (a client's coach, or the client) and sends the web-push.
//
// Sends the signed-in user's access token: notify-user now verifies the
// caller is allowed to send each event (the client for client→coach events,
// the client's coach for coach→client ones — see api/_notifyAuth.js) and
// rejects anonymous requests, which it used to accept from anyone.
//
// Best-effort only: never throws and never blocks the calling flow — a failed
// or unavailable backend (e.g. local dev, where /api routes aren't served)
// must not break saving a workout, plan, or measurement.
export function notifyEvent(event, payload = {}) {
  (async () => {
    const token = await resolveRealAccessToken().catch(() => null);
    await fetch('/api/notify-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ event, ...payload })
    });
  })().catch(() => {});
}
