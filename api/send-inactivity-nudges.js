import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

webPush.setVapidDetails(
  'mailto:support@fitengineers.com',
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Daily cron (see vercel.json) that flags anyone who hasn't logged in since
// yesterday and pushes a tiered nudge, plus a heads-up to the client's coach
// once the gap reaches 2+ days. Mirrors the push-delivery pattern in
// send-nudges.js / notify-user.js (webPush + push_subscriptions by user_id),
// but is driven by users.last_login (see sql/last_login_tracking.sql)
// instead of a fixed IST time-of-day slot.

function daysSince(lastLogin) {
  if (!lastLogin) return null;
  return Math.floor((Date.now() - new Date(lastLogin).getTime()) / (24 * 60 * 60 * 1000));
}

function clientMessage(name, days) {
  if (days === 1) {
    return {
      title: `We missed you yesterday, ${name} 👋`,
      body: "You haven't logged in since yesterday. Let's get today's workout in — even a short one keeps the streak alive! 💪"
    };
  }
  if (days === 2) {
    return {
      title: `2 days quiet, ${name} 🧩`,
      body: "It's been 2 days — your muscle balance analysis is starting to fall behind. Jump back in today and let's catch it up."
    };
  }
  return {
    title: `${days} days and counting, ${name} ⏳`,
    body: `It's been ${days} days since your last session. Consistency is what gets results — let's restart today, one workout at a time.`
  };
}

function coachSelfMessage(name, days) {
  if (days === 1) {
    return {
      title: `Welcome back, Coach ${name} 👋`,
      body: "You haven't checked in since yesterday. Your clients may have updates waiting — take a look today."
    };
  }
  return {
    title: `${days} days since your last check-in, Coach ${name}`,
    body: `It's been ${days} days. A few clients may need a nudge or a note from you — open the dashboard when you can.`
  };
}

function coachAboutClientMessage(clientName, days) {
  return {
    title: `👀 ${clientName} has gone quiet`,
    body: `${clientName} hasn't logged in for ${days} days. A quick check-in message from you could help them get back on track.`
  };
}

async function sendTo(userId, title, body) {
  if (!userId) return { sent: 0, failed: 0 };
  const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', userId);
  if (!subs || subs.length === 0) return { sent: 0, failed: 0 };
  const payload = JSON.stringify({ title, body, icon: '/logo.png', vibrate: [300, 100, 300] });
  let sent = 0, failed = 0;
  for (const sub of subs) {
    try {
      await webPush.sendNotification(sub.subscription, payload);
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }
  return { sent, failed };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const triggerAuth = req.headers['authorization'] || req.query.secret;
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && triggerAuth !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized secret credentials.' });
  }

  try {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, full_name, last_login');
    if (usersError) throw usersError;

    const { data: clientRows } = await supabase.from('clients').select('user_id, full_name, coach_id');
    const { data: coachRows } = await supabase.from('coaches').select('user_id, brand_name, status');

    let clientNudges = 0, coachNudges = 0, coachAlerts = 0, skipped = 0;

    for (const u of users || []) {
      const days = daysSince(u.last_login);
      if (days === null || days < 1) { skipped++; continue; } // never logged in, or active today

      const clientRow = (clientRows || []).find((c) => c.user_id === u.id);
      const coachRow = (coachRows || []).find((c) => c.user_id === u.id && c.status === 'approved');

      if (clientRow) {
        const name = clientRow.full_name || u.full_name || 'there';
        const msg = clientMessage(name, days);
        const result = await sendTo(u.id, msg.title, msg.body);
        if (result.sent > 0) clientNudges++;

        // 2+ days quiet: also alert the assigned coach, once per cron run.
        if (days >= 2 && clientRow.coach_id) {
          const alert = coachAboutClientMessage(name, days);
          const coachResult = await sendTo(clientRow.coach_id, alert.title, alert.body);
          if (coachResult.sent > 0) coachAlerts++;
        }
      } else if (coachRow) {
        const name = coachRow.brand_name || u.full_name || 'there';
        const msg = coachSelfMessage(name, days);
        const result = await sendTo(u.id, msg.title, msg.body);
        if (result.sent > 0) coachNudges++;
      } else {
        skipped++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Inactivity sweep complete. Client nudges: ${clientNudges}, coach self-nudges: ${coachNudges}, coach alerts about inactive clients: ${coachAlerts}, skipped (active/never logged in/unmatched): ${skipped}.`
    });
  } catch (error) {
    console.error('Inactivity nudge sweep error:', error);
    return res.status(500).json({ error: 'Inactivity nudge sweep failed.', details: error.message });
  }
}
