import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

webPush.setVapidDetails(
  'mailto:support@fitengineers.com',
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// sql/lock_down_reads.sql gates SELECT on users/clients/push_subscriptions to
// auth.uid()-derived checks. This code runs server-side with the anon key and no
// user session, so auth.uid() is NULL and those direct .from().select() reads
// silently return zero rows. The get_*_for_server / get_push_subscriptions_for_broadcast
// RPCs (sql/server_reads_rpc.sql, sql/push_subscriptions_broadcast_rpc.sql) are
// SECURITY DEFINER, secret-gated escape hatches for exactly this case — writes
// (insert/update/delete) are unaffected and still go through the normal client.
const BROADCAST_SECRET = process.env.BROADCAST_SECRET;

async function rpcAll(fn) {
  if (!BROADCAST_SECRET) throw new Error(`BROADCAST_SECRET is not set — required for ${fn}.`);
  const { data, error } = await supabase.rpc(fn, { secret: BROADCAST_SECRET });
  if (error) throw error;
  return data || [];
}

// Look up a target user's email + display name so we can match their push
// subscriptions even when the row predates the user_id column.
async function getUserContact(userId) {
  const users = await rpcAll('get_users_for_server');
  const user = users.find((u) => u.id === userId);
  return user ? { email: user.email, full_name: user.full_name } : null;
}

// Collect every push subscription belonging to a target user. Matches on
// user_id (new rows) AND, as a fallback, the email stored inside the
// subscription JSON and the display name (older rows created before the
// user_id column existed) — so a coach/client who subscribed earlier still
// receives targeted notifications without having to re-subscribe.
async function findSubscriptions(targetUserId, email, name) {
  const all = await rpcAll('get_push_subscriptions_for_broadcast');
  const byEndpoint = new Map();
  for (const r of all) {
    const matches = r.user_id === targetUserId
      || (email && r.subscription?.userEmail === email)
      || (name && r.user_name === name);
    if (matches) byEndpoint.set(r.endpoint, r);
  }
  return Array.from(byEndpoint.values());
}

// Deliver a web-push to every device subscribed for a given users.id.
async function pushToUser(targetUserId, title, body) {
  const contact = await getUserContact(targetUserId);
  const subs = await findSubscriptions(targetUserId, contact?.email, contact?.full_name);
  if (!subs || subs.length === 0) return { sent: 0, failed: 0, matched: 0 };

  const payload = JSON.stringify({ title, body, icon: '/logo.png', vibrate: [300, 100, 300] });
  let sent = 0, failed = 0;
  for (const sub of subs) {
    try {
      await webPush.sendNotification(sub.subscription, payload);
      // Backfill user_id on legacy rows so future lookups are a direct hit.
      if (!sub.user_id) {
        await supabase.from('push_subscriptions').update({ user_id: targetUserId }).eq('id', sub.id);
      }
      sent++;
    } catch (err) {
      failed++;
      // Clean up expired/blocked subscriptions.
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }
  return { sent, failed, matched: subs.length };
}

async function getClientRow(clientUserId) {
  const clients = await rpcAll('get_clients_for_server');
  const row = clients.find((c) => c.user_id === clientUserId);
  return row ? { coach_id: row.coach_id, full_name: row.full_name } : null;
}

// Display name for the coach side of a client relationship — used as the
// notification header (title) for events sent TO the client, so it reads
// as "Coach Name / Session started" the same way a phone shows a contact's
// name as the notification header, not the app name.
async function getCoachDisplayName(coachId) {
  if (!coachId) return 'Your Coach';
  const contact = await getUserContact(coachId);
  return contact?.full_name || 'Your Coach';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { event, clientUserId, planName, durationSeconds, caloriesBurned, workoutName, message, sessionsLeft, oldCoachId } = req.body || {};
  if (!event || !clientUserId || !UUID_RE.test(clientUserId)) {
    return res.status(400).json({ error: 'event and a valid clientUserId are required.' });
  }

  try {
    const client = await getClientRow(clientUserId);
    const clientName = client?.full_name || 'Your client';

    let targetUserId = null;
    let title = '';
    let body = '';

    // Notification shape, app-wide: title is the PERSON the notification is
    // about/from (like a phone showing a contact's name as the header), and
    // body is a short one-line status — not a full sentence explaining
    // itself. Mirrors how WhatsApp/iMessage push notifications read (name up
    // top, "Sent a photo" / "Skipping today" below), rather than a generic
    // "Fitengineers" app banner every time.
    if (event === 'workout_started') {
      // Notify the client's coach that a session has begun.
      if (!client?.coach_id) return res.status(200).json({ success: true, message: 'Client has no coach; nothing to send.' });
      targetUserId = client.coach_id;
      title = clientName;
      body = 'Session started';
    } else if (event === 'measurements_saved') {
      // Notify the client's coach that new measurements are in.
      if (!client?.coach_id) return res.status(200).json({ success: true, message: 'Client has no coach; nothing to send.' });
      targetUserId = client.coach_id;
      title = clientName;
      body = 'Updated body measurements';
    } else if (event === 'workout_finished') {
      // Notify the client's coach that a session was completed, with the real
      // duration and calories, so the coach can send a note back.
      if (!client?.coach_id) return res.status(200).json({ success: true, message: 'Client has no coach; nothing to send.' });
      targetUserId = client.coach_id;
      const mins = Number.isFinite(durationSeconds) ? Math.max(1, Math.round(durationSeconds / 60)) : null;
      const cals = Number.isFinite(caloriesBurned) ? Math.round(caloriesBurned) : null;
      const stats = [mins != null ? `${mins} min` : null, cals != null ? `${cals} kcal` : null].filter(Boolean).join(' · ');
      title = clientName;
      body = `Workout completed${stats ? ` — ${stats}` : ''}`;
    } else if (event === 'coach_note') {
      // Notify the client that their coach sent them a note — the coach's
      // actual words are the notification body, their name is the header.
      if (!message || !message.trim()) return res.status(400).json({ error: 'message is required for coach_note.' });
      targetUserId = clientUserId;
      title = await getCoachDisplayName(client?.coach_id);
      body = message.trim();
    } else if (event === 'client_reply') {
      // Notify the coach that their client replied to a note — fires
      // straight to the coach's home screen/device, mirroring workout_finished.
      if (!message || !message.trim()) return res.status(400).json({ error: 'message is required for client_reply.' });
      if (!client?.coach_id) return res.status(200).json({ success: true, message: 'Client has no coach; nothing to send.' });
      targetUserId = client.coach_id;
      title = clientName;
      body = message.trim();
    } else if (event === 'session_reminder') {
      // Coach-triggered nudge to the client that their session package is
      // running low — manual "Send renewal reminder" button on the coach
      // dashboard, shown once sessions-left ≤ 4. No single "other person" to
      // head this with (it's a system nudge about the client's own account),
      // so it keeps the coach's name as the header since that's who they'd
      // talk to about renewing.
      targetUserId = clientUserId;
      const left = Number.isFinite(sessionsLeft) ? sessionsLeft : null;
      title = await getCoachDisplayName(client?.coach_id);
      body = left != null
        ? `${left} session${left === 1 ? '' : 's'} left — talk to your coach about renewing`
        : 'Session package running low — talk to your coach about renewing';
    } else if (event === 'client_disconnected') {
      // Courtesy notice to the coach that a client's package ran out with no
      // renewal and they were auto-disconnected (moved to unattached
      // clients). Fired by the client's own app AFTER the disconnect write,
      // so client.coach_id is already null and no longer resolvable here —
      // the caller passes the old coach id directly instead.
      if (!oldCoachId) return res.status(200).json({ success: true, message: 'No coach to notify.' });
      targetUserId = oldCoachId;
      title = clientName;
      body = 'Package ended — moved to unattached clients';
    } else if (event === 'plan_assigned') {
      // Notify the client that their coach sent a new plan.
      targetUserId = clientUserId;
      title = await getCoachDisplayName(client?.coach_id);
      body = planName ? `Sent you a new plan: "${planName}"` : 'Sent you a new workout plan';
    } else {
      return res.status(400).json({ error: `Unknown event "${event}".` });
    }

    const result = await pushToUser(targetUserId, title, body);
    return res.status(200).json({ success: true, event, ...result });
  } catch (error) {
    console.error('notify-user error:', error);
    return res.status(500).json({ error: 'Notification failed.', details: error.message });
  }
}
