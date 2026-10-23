// Helpers for the coach home's "gone quiet" card (CoachQuietClients).
import { daysSinceLogin } from './activityStatus';
import { APP_LINK } from './whatsappNudge';

export const QUIET_DAYS = 3;

// How far back the message's "sessions together" recap looks.
export const RECAP_DAYS = 30;

// Quiet clients, longest-quiet first; never-logged-in ones last (they're
// usually brand-new invites, not people drifting away).
export function getQuietClients(clients = []) {
  return clients
    .filter(c => !c.paused_at)
    .map(c => ({ client: c, days: daysSinceLogin(c.last_login) }))
    .filter(({ days }) => days === null || days >= QUIET_DAYS)
    .sort((a, b) => (a.days === null) - (b.days === null) || (b.days ?? 0) - (a.days ?? 0));
}

// workout_logs rows (one per set) → { [userId]: { sessions, sets, lastDate } }.
// A session is one client + log_date + plan name, same grouping as
// getWorkoutSummaryForCoach.
export function summarizeRecentSessions(rows = []) {
  const byClient = {};
  rows.forEach(r => {
    const s = byClient[r.user_id] || (byClient[r.user_id] = { keys: new Set(), sets: 0, lastDate: null });
    s.keys.add(`${r.log_date}|${r.plan_name || ''}`);
    s.sets += 1;
    if (!s.lastDate || r.log_date > s.lastDate) s.lastDate = r.log_date;
  });
  const out = {};
  Object.entries(byClient).forEach(([id, s]) => {
    out[id] = { sessions: s.keys.size, sets: s.sets, lastDate: s.lastDate };
  });
  return out;
}

// "Thu, 16 Oct" from a local YYYY-MM-DD.
function formatSessionDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

// recap (optional) is this client's summarizeRecentSessions entry. Clients
// whose coach logs their workouts rarely open the app themselves, so for
// them "haven't seen you in the app" is the wrong message — instead tell
// them what's already waiting in it from the sessions we've done.
export function buildQuietMessage(client, days, signOff, recap = null) {
  const firstName = (client.userName || '').trim().split(/\s+/)[0] || 'there';
  let body;
  if (recap && recap.sessions > 0) {
    const n = recap.sessions;
    body = `Hi ${firstName}! 👋 Quick update — we've done ${n} session${n === 1 ? '' : 's'} together in the last ${RECAP_DAYS} days (${recap.sets} sets), the latest on ${formatSessionDate(recap.lastDate)}.\n\n` +
      `Every set is saved in your app. Open it to see your workout history, how your lifts are progressing and which muscles we've been training.\n\n` +
      `While you're in there, please log today's weight under Measurements — it helps me track your results 📈`;
    if (days === null) body += `\n\nFirst time? Just sign in with this email: ${client.email || 'the one you gave me'}.`;
  } else if (days === null) {
    body = `Hi ${firstName}! 👋 Your plan is all set up in the app — have you had a chance to open it yet? Tap the link below to log in and get started. Shout if anything's unclear!`;
  } else {
    body = `Hi ${firstName}! 👋 Haven't seen you in the app for a few days — how are things going? No pressure at all, your plan is right where you left it. Tap below whenever you're ready to jump back in 💪`;
  }
  return `${body}\n\n${APP_LINK}${signOff ? `\n\n— ${signOff}` : ''}`;
}
