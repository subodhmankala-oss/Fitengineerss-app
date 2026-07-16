import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

webPush.setVapidDetails(
  'mailto:support@fitengineers.com',
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Look up a target user's email + display name so we can match their push
// subscriptions even when the row predates the user_id column.
async function getUserContact(userId) {
  const { data } = await supabase
    .from('users')
    .select('email, full_name')
    .eq('id', userId)
    .maybeSingle();
  return data || null;
}

// Collect every push subscription belonging to a target user. Matches on
// user_id (new rows) AND, as a fallback, the email stored inside the
// subscription JSON and the display name (older rows created before the
// user_id column existed) — so a coach/client who subscribed earlier still
// receives targeted notifications without having to re-subscribe.
async function findSubscriptions(targetUserId, email, name) {
  const byEndpoint = new Map();
  const collect = (rows) => (rows || []).forEach((r) => byEndpoint.set(r.endpoint, r));

  const q1 = await supabase.from('push_subscriptions').select('*').eq('user_id', targetUserId);
  collect(q1.data);
  if (email) {
    const q2 = await supabase.from('push_subscriptions').select('*').eq('subscription->>userEmail', email);
    collect(q2.data);
  }
  if (name) {
    const q3 = await supabase.from('push_subscriptions').select('*').eq('user_name', name);
    collect(q3.data);
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
  const { data } = await supabase
    .from('clients')
    .select('coach_id, full_name')
    .eq('user_id', clientUserId)
    .maybeSingle();
  return data || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { event, clientUserId, planName } = req.body || {};
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
