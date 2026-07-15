import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wzifwepqggyqkylyxqcx.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6aWZ3ZXBxZ2d5cWt5bHl4cWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODE4NjE5NjIsImV4cCI6MTk5NzQzNzk2Mn0.a452hS-sR6c_g0W1Z_37_0';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

webPush.setVapidDetails(
  'mailto:support@fitengineers.com',
  process.env.VITE_VAPID_PUBLIC_KEY || 'BIupVfv6kg0G6uCsUWYciNynMR5xs6F3dl3QWXjRWGFkfZzvBPClM_FSLCEInVTDF0wtMkk5sDfbmWH1b2RMuqk',
  process.env.VAPID_PRIVATE_KEY || 'Fi8qX-4M-3qo3IfOUT174OPWrcX6uoa0YFilm82IJTs'
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Deliver a web-push to every device subscribed for a given users.id.
async function pushToUser(targetUserId, title, body) {
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', targetUserId);
  if (error) throw error;
  if (!subs || subs.length === 0) return { sent: 0, failed: 0 };

  const payload = JSON.stringify({ title, body, icon: '/logo.png', vibrate: [300, 100, 300] });
  let sent = 0, failed = 0;
  for (const sub of subs) {
    try {
      await webPush.sendNotification(sub.subscription, payload);
      sent++;
    } catch (err) {
      failed++;
      // Clean up expired/blocked subscriptions.
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }
  return { sent, failed };
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
