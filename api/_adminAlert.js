// Sign-up alerts to the super-admin (new client finished sign-up, sign-up
// started but not finished, new coach). Underscore-prefixed so Vercel
// doesn't deploy it as its own function; imported by complete-onboarding.js,
// auth-register.js and push.js.
//
// Each alert is two things:
//   1. a public.notifications row — the durable in-app copy. The super-admin
//      dashboard reads unread rows and shows them as cards on the Admin panel
//      (plus a dot on the Admin toggle), so a swiped-away push isn't lost.
//      The row also de-duplicates: one alert per (type, person), ever —
//      register-coach-google is an upsert that can run again for an existing
//      coach, and the incomplete-sign-up sweep runs several times a day.
//   2. a Web Push to the super-admin's devices, logged to push_log.
//
// Raw REST with the service-role key (same as complete-onboarding.js) so any
// function can call it without its own supabase-js client. Never throws — an
// alert hiccup must not fail the sign-up that triggered it.
import webPush from 'web-push';
import { SUPER_ADMIN_EMAIL } from './_notifyAuth.js';

export const SIGNUP_ALERT_TYPES = ['new_client_signup', 'signup_incomplete', 'new_coach_signup'];

function vapidReady() {
  const pub = process.env.VITE_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  // VAPID vars are Production-only — on previews this skips the push but
  // still writes the in-app row, which is what makes previews testable.
  if (!pub || !priv) return false;
  try {
    webPush.setVapidDetails('mailto:support@fitengineers.com', pub, priv);
    return true;
  } catch {
    return false;
  }
}

export async function alertSuperAdmin({ supabaseUrl, serviceKey, type, actorUserId, title, body, url = null, payload = {} }) {
  if (!supabaseUrl || !serviceKey || !type || !actorUserId) return { alerted: false, reason: 'missing_args' };
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const rest = (path, init = {}) => fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });

  try {
    const adminRows = await rest(`users?email=eq.${encodeURIComponent(SUPER_ADMIN_EMAIL)}&select=id`).then(r => r.json()).catch(() => []);
    const adminId = Array.isArray(adminRows) ? adminRows[0]?.id : null;
    if (!adminId) return { alerted: false, reason: 'no_admin' };
    // The super-admin signing up as a coach / client on their own account.
    if (adminId === actorUserId) return { alerted: false, reason: 'self' };

    const existing = await rest(
      `notifications?recipient_user_id=eq.${adminId}&type=eq.${encodeURIComponent(type)}&actor_user_id=eq.${encodeURIComponent(actorUserId)}&select=id&limit=1`
    ).then(r => r.json()).catch(() => null);
    if (Array.isArray(existing) && existing.length > 0) return { alerted: false, reason: 'duplicate' };

    const insertResp = await rest('notifications', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        recipient_user_id: adminId,
        type,
        actor_user_id: actorUserId,
        payload: { url, title, body, ...payload }
      })
    });
    if (!insertResp.ok) {
      // actor_user_id is an FK to public.users — a missing row means there's
      // no one to alert about; anything else, still try the push.
      console.warn(`[adminAlert] notifications insert failed for ${type}:`, insertResp.status);
    }

    let sent = 0, failed = 0;
    if (vapidReady()) {
      const subs = await rest(`push_subscriptions?user_id=eq.${adminId}&select=id,subscription`).then(r => r.json()).catch(() => []);
      const pushPayload = JSON.stringify({ title, body, icon: '/logo.png', vibrate: [300, 100, 300], url: url || undefined });
      await Promise.all((Array.isArray(subs) ? subs : []).map(async (sub) => {
        try {
          await webPush.sendNotification(sub.subscription, pushPayload);
          sent++;
        } catch (err) {
          failed++;
          if (err.statusCode === 410 || err.statusCode === 404) {
            await rest(`push_subscriptions?id=eq.${encodeURIComponent(sub.id)}`, { method: 'DELETE' }).catch(() => {});
          }
        }
      }));
      await rest('push_log', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ event: type, target_user_id: adminId, title, body, sent_count: sent, failed_count: failed })
      }).catch(() => {});
    }
    return { alerted: true, sent, failed };
  } catch (err) {
    console.error(`[adminAlert] ${type} alert failed (non-fatal):`, err);
    return { alerted: false, reason: 'exception' };
  }
}

// The client finished sign-up after all — mark any unread "not finished"
// alert for them read so the stale card disappears. Never throws.
export async function clearSignupIncompleteAlert({ supabaseUrl, serviceKey, actorUserId }) {
  if (!supabaseUrl || !serviceKey || !actorUserId) return;
  try {
    await fetch(
      `${supabaseUrl}/rest/v1/notifications?type=eq.signup_incomplete&actor_user_id=eq.${encodeURIComponent(actorUserId)}&read_at=is.null`,
      {
        method: 'PATCH',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ read_at: new Date().toISOString() })
      }
    );
  } catch (err) {
    console.warn('[adminAlert] clearing signup_incomplete failed (non-fatal):', err);
  }
}

// "⏸️ Sign-up not finished" — clients who created an account at least
// MIN_AGE ago but never completed the onboarding wizard. Runs on each of the
// daily send-nudges cron slots (Hobby plan crons can't run hourly), so the
// alert lands within a few hours. MAX_AGE bounds the look-back so the first
// run after deploy doesn't alert on every abandoned account ever.
const INCOMPLETE_MIN_AGE_MS = 60 * 60 * 1000;
const INCOMPLETE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export function findIncompleteSignups(clients, now = Date.now()) {
  return (clients || []).filter(c => {
    if (c.onboarding_completed === true || !c.user_id || !c.created_at) return false;
    const age = now - new Date(c.created_at).getTime();
    return age >= INCOMPLETE_MIN_AGE_MS && age <= INCOMPLETE_MAX_AGE_MS;
  });
}

export function hoursAgoLabel(createdAt, now = Date.now()) {
  const hours = Math.floor((now - new Date(createdAt).getTime()) / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export async function runIncompleteSignupSweep({ supabaseUrl, serviceKey, clients, users }) {
  const candidates = findIncompleteSignups(clients);
  let alerted = 0;
  for (const c of candidates) {
    const user = (users || []).find(u => u.id === c.user_id);
    const name = c.full_name || user?.full_name || null;
    const who = name ? `${name}${user?.email ? ` (${user.email})` : ''}` : (user?.email || 'Someone');
    const r = await alertSuperAdmin({
      supabaseUrl,
      serviceKey,
      type: 'signup_incomplete',
      actorUserId: c.user_id,
      title: '⏸️ Sign-up not finished',
      body: `${who} created an account ${hoursAgoLabel(c.created_at)} but stopped before finishing sign-up.`,
      url: `/?viewClient=${c.user_id}`,
      payload: { client_name: name, client_email: user?.email || null }
    });
    if (r.alerted) alerted++;
  }
  return { candidates: candidates.length, alerted };
}
