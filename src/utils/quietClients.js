// Helpers for the coach home's "gone quiet" card (CoachQuietClients).
import { daysSinceLogin } from './activityStatus';
import { APP_LINK } from './whatsappNudge';

export const QUIET_DAYS = 3;

// Quiet clients, longest-quiet first; never-logged-in ones last (they're
// usually brand-new invites, not people drifting away).
export function getQuietClients(clients = []) {
  return clients
    .filter(c => !c.paused_at)
    .map(c => ({ client: c, days: daysSinceLogin(c.last_login) }))
    .filter(({ days }) => days === null || days >= QUIET_DAYS)
    .sort((a, b) => (a.days === null) - (b.days === null) || (b.days ?? 0) - (a.days ?? 0));
}

export function buildQuietMessage(client, days, signOff) {
  const firstName = (client.userName || '').trim().split(/\s+/)[0] || 'there';
  const body = days === null
    ? `Hi ${firstName}! 👋 Your plan is all set up in the app — have you had a chance to open it yet? Tap the link below to log in and get started. Shout if anything's unclear!`
    : `Hi ${firstName}! 👋 Haven't seen you in the app for a few days — how are things going? No pressure at all, your plan is right where you left it. Tap below whenever you're ready to jump back in 💪`;
  return `${body}\n\n${APP_LINK}${signOff ? `\n\n— ${signOff}` : ''}`;
}
