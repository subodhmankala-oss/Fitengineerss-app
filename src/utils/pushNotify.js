// Fire-and-forget trigger for a targeted cross-user push notification.
// Posts to the Vercel /api/notify-user backend, which resolves the correct
// recipient (a client's coach, or the client) and sends the web-push.
//
// Best-effort only: never throws and never blocks the calling flow — a failed
// or unavailable backend (e.g. local dev, where /api routes aren't served)
// must not break saving a workout, plan, or measurement.
export function notifyEvent(event, payload = {}) {
  try {
    fetch('/api/notify-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...payload })
    }).catch(() => {});
  } catch (e) {
    /* ignore */
  }
}
