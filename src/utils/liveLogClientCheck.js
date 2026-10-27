// "Are you on the right client?" check for the coach Live Log.
//
// On 2026-10-26 a coach logged one client's (Nikhil's) whole session on
// another client's (Kiran's) page — they train the same program at the same
// hour — and it saved to Kiran. Kiran was logging their own workout on their
// phone at that very moment, so the app had the signal to catch it. This
// turns that signal into a warning.
//
// Two signals, strongest first:
//  - 'logging': the client has their own session open on their phone today
//    and touched it recently (workout_drafts source 'self', summarised by
//    api/data-read.js for the client's coach).
//  - 'logged': the client already saved a workout from their own phone
//    today. Coach Live Log saves (session_id 'coach-live-…') don't count —
//    otherwise the session the coach just saved would warn on the next one.

// A self draft untouched for longer than this is an abandoned session, not
// someone training right now. Generous: the client logger saves on every
// tick, but a long rest or a phone left in a bag can go quiet for a while.
export const CLIENT_SESSION_ACTIVE_MS = 2 * 60 * 60 * 1000;

const isCoachLiveSession = (sessionId) => String(sessionId || '').startsWith('coach-live-');

// clientSession: { planName, logDate, updatedAt } | null
// logs: raw workout_logs rows for this client (log_date, plan_name,
//       session_id, created_at)
// Returns { kind, planName, at, key } or null. `key` identifies this exact
// signal so a coach who confirms "yes, it's them" isn't asked again for it.
export function findWrongClientSignal({ clientSession, logs, today, now }) {
  if (clientSession && (!clientSession.logDate || clientSession.logDate === today)) {
    const updatedMs = Date.parse(clientSession.updatedAt || '');
    if (Number.isFinite(updatedMs) && now - updatedMs <= CLIENT_SESSION_ACTIVE_MS) {
      return {
        kind: 'logging',
        planName: clientSession.planName || '',
        at: updatedMs,
        key: `logging|${clientSession.planName || ''}|${clientSession.logDate || ''}`
      };
    }
  }

  let latest = null;
  (logs || []).forEach(r => {
    if (r.log_date !== today || isCoachLiveSession(r.session_id)) return;
    const at = Date.parse(r.created_at || '');
    if (!latest || (Number.isFinite(at) && at > latest.at)) {
      latest = { planName: r.plan_name || '', at: Number.isFinite(at) ? at : null, sessionId: r.session_id || '' };
    }
  });
  if (latest) {
    return {
      kind: 'logged',
      planName: latest.planName,
      at: latest.at,
      key: `logged|${latest.sessionId || latest.planName}`
    };
  }
  return null;
}

const formatClock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// One plain sentence for the banner.
export function describeWrongClientSignal(signal, clientName, now) {
  if (!signal) return '';
  const name = clientName || 'This client';
  const plan = signal.planName ? `"${signal.planName}"` : 'a workout';
  if (signal.kind === 'logging') {
    const mins = signal.at ? Math.max(0, Math.round((now - signal.at) / 60000)) : null;
    const when = mins == null ? '' : mins < 1 ? ', active just now' : `, active ${mins} min ago`;
    return `${name} is logging ${plan} on their own phone right now${when}.`;
  }
  const when = signal.at ? ` at ${formatClock(signal.at)}` : '';
  return `${name} already logged ${plan} on their own phone today${when}.`;
}
