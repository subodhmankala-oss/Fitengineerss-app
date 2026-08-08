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

    if (event === 'workout_started') {
      // Notify the client's coach that a session has begun.
      if (!client?.coach_id) return res.status(200).json({ success: true, message: 'Client has no coach; nothing to send.' });
      targetUserId = client.coach_id;
      title = '🏋️ Session Started';
      body = `${clientName} has just started a workout session. Great time to check in and cheer them on!`;
    } else if (event === 'measurements_saved') {
      // Notify the client's coach that new measurements are in.
      if (!client?.coach_id) return res.status(200).json({ success: true, message: 'Client has no coach; nothing to send.' });
      targetUserId = client.coach_id;
      title = '📏 New Measurements';
      body = `${clientName} has just updated their body measurements. Take a look to track their progress.`;
    } else if (event === 'workout_finished') {
      // Notify the client's coach that a session was completed, with the real
      // duration and calories, so the coach can send a note back.
      if (!client?.coach_id) return res.status(200).json({ success: true, message: 'Client has no coach; nothing to send.' });
      targetUserId = client.coach_id;
      const mins = Number.isFinite(durationSeconds) ? Math.max(1, Math.round(durationSeconds / 60)) : null;
      const cals = Number.isFinite(caloriesBurned) ? Math.round(caloriesBurned) : null;
      const stats = [mins != null ? `${mins} min` : null, cals != null ? `${cals} kcal` : null].filter(Boolean).join(' · ');
      const workoutLabel = workoutName ? `"${workoutName}"` : 'a workout';
      title = '✅ Workout Completed';
      body = `${clientName} finished ${workoutLabel}${stats ? ` — ${stats}` : ''}. Open the app to send them a note.`;
    } else if (event === 'coach_note') {
      // Notify the client that their coach sent them a note — the coach's
      // actual words are the notification body.
      if (!message || !message.trim()) return res.status(400).json({ error: 'message is required for coach_note.' });
      targetUserId = clientUserId;
      title = '💬 Note from your coach';
      body = message.trim();
    } else if (event === 'client_reply') {
      // Notify the coach that their client replied to a note — fires
      // straight to the coach's home screen/device, mirroring workout_finished.
      if (!message || !message.trim()) return res.status(400).json({ error: 'message is required for client_reply.' });
      if (!client?.coach_id) return res.status(200).json({ success: true, message: 'Client has no coach; nothing to send.' });
      targetUserId = client.coach_id;
      title = `💬 Reply from ${clientName}`;
      body = message.trim();
    } else if (event === 'session_reminder') {
      // Coach-triggered nudge to the client that their session package is
      // running low — manual "Send renewal reminder" button on the coach
      // dashboard, shown once sessions-left ≤ 4.
      targetUserId = clientUserId;
      const left = Number.isFinite(sessionsLeft) ? sessionsLeft : null;
      title = '⏳ Sessions Running Low';
      body = left != null
        ? `You have ${left} session${left === 1 ? '' : 's'} left in your current package. Talk to your coach about renewing to keep your progress going!`
        : `Your session package is running low. Talk to your coach about renewing to keep your progress going!`;
    } else if (event === 'client_disconnected') {
      // Courtesy notice to the coach that a client's package ran out with no
      // renewal and they were auto-disconnected (moved to unattached
      // clients). Fired by the client's own app AFTER the disconnect write,
      // so client.coach_id is already null and no longer resolvable here —
      // the caller passes the old coach id directly instead.
      if (!oldCoachId) return res.status(200).json({ success: true, message: 'No coach to notify.' });
      targetUserId = oldCoachId;
      title = '📦 Client Package Ended';
      body = `${clientName} completed their full session package and was moved to unattached clients. Reconnect them anytime with a new invite code.`;
    } else if (event === 'plan_assigned') {
      // Notify the client that their coach sent a new plan.
      targetUserId = clientUserId;
      title = '📋 New Workout Plan';
      body = planName
        ? `Your coach has sent you a new workout plan: "${planName}". Open the app when you're ready to begin.`
        : `Your coach has sent you a new workout plan. Open the app when you're ready to begin.`;
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
