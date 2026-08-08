import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// Set VAPID keys
webPush.setVapidDetails(
  'mailto:support@fitengineers.com',
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// sql/lock_down_reads.sql gates SELECT on users/clients/coaches/tracker_logs/
// push_subscriptions to auth.uid()-derived checks. This file runs server-side with
// the anon key and no user session, so auth.uid() is NULL and direct .from().select()
// reads on those tables silently return zero rows. The get_*_for_server RPCs
// (sql/server_reads_rpc.sql, sql/push_subscriptions_broadcast_rpc.sql) are SECURITY
// DEFINER, secret-gated escape hatches for exactly this case — writes
// (insert/update/delete) are unaffected and still go through the normal client.
const BROADCAST_SECRET = process.env.BROADCAST_SECRET;

async function rpcAll(supabaseClient, fn) {
  if (!BROADCAST_SECRET) throw new Error(`BROADCAST_SECRET is not set — required for ${fn}.`);
  const { data, error } = await supabaseClient.rpc(fn, { secret: BROADCAST_SECRET });
  if (error) throw error;
  return data || [];
}

const morningQuotes = [
  "Good morning. Today is another chance to invest in yourself — one steady, intentional choice at a time. Let's make it count. ☀️",
  "Rise and shine. Progress is built on consistency, not perfection. Show up for yourself today and the results will follow. 💪",
  "Good morning. Your body is capable of remarkable things when you treat it with care. Start today strong and hydrated. 🌿",
  "A fresh morning, a fresh start. Small disciplined actions today become the strength you'll be proud of tomorrow. 🌅",
  "Good morning. Fuel your body well, move with purpose, and be kind to yourself. You've got everything it takes. 🙌"
];

// ─── Inactivity sweep (job=inactivity) ───
// Folded into this same file/function — rather than a separate
// api/send-inactivity-nudges.js — to stay under Vercel's Hobby-plan
// serverless function count limit (12), same reasoning as the DELETE
// branch in api/subscribe.js. Its own cron entry in vercel.json hits this
// file with ?job=inactivity so it runs as an independent daily sweep,
// completely separate from the hourly wellness-slot logic below. Flags
// anyone who hasn't logged in since yesterday (users.last_login — see
// sql/last_login_tracking.sql) and pushes a tiered nudge, plus a heads-up
// to the client's coach once the gap reaches 2+ days.
function daysSinceLogin(lastLogin) {
  if (!lastLogin) return null;
  return Math.floor((Date.now() - new Date(lastLogin).getTime()) / (24 * 60 * 60 * 1000));
}

function clientInactivityMessage(name, days) {
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

function coachSelfInactivityMessage(name, days) {
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

function coachAboutInactiveClientMessage(clientName, days) {
  return {
    title: `👀 ${clientName} has gone quiet`,
    body: `${clientName} hasn't logged in for ${days} days. A quick check-in message from you could help them get back on track.`
  };
}

async function pushToUserId(supabase, userId, title, body) {
  if (!userId) return { sent: 0, failed: 0 };
  const allSubs = await rpcAll(supabase, 'get_push_subscriptions_for_broadcast');
  const subs = allSubs.filter((s) => s.user_id === userId);
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

async function runInactivitySweep(supabase, res) {
  try {
    const users = await rpcAll(supabase, 'get_users_for_server');
    const clientRows = await rpcAll(supabase, 'get_clients_for_server');
    const coachRows = await rpcAll(supabase, 'get_coaches_for_server');

    let clientNudges = 0, coachNudges = 0, coachAlerts = 0, skipped = 0;

    for (const u of users || []) {
      const days = daysSinceLogin(u.last_login);
      if (days === null || days < 1) { skipped++; continue; } // never logged in, or active today

      const clientRow = (clientRows || []).find((c) => c.user_id === u.id);
      const coachRow = (coachRows || []).find((c) => c.user_id === u.id && c.status === 'approved');

      if (clientRow) {
        const name = clientRow.full_name || u.full_name || 'there';
        const msg = clientInactivityMessage(name, days);
        const result = await pushToUserId(supabase, u.id, msg.title, msg.body);
        if (result.sent > 0) clientNudges++;

        // 2+ days quiet: also alert the assigned coach, once per cron run.
        if (days >= 2 && clientRow.coach_id) {
          const alert = coachAboutInactiveClientMessage(name, days);
          const coachResult = await pushToUserId(supabase, clientRow.coach_id, alert.title, alert.body);
          if (coachResult.sent > 0) coachAlerts++;
        }
      } else if (coachRow) {
        const name = coachRow.brand_name || u.full_name || 'there';
        const msg = coachSelfInactivityMessage(name, days);
        const result = await pushToUserId(supabase, u.id, msg.title, msg.body);
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

export default async function handler(req, res) {
  // Allow trigger via GET or POST
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Optional: Add simple secret key security for trigger
  const triggerAuth = req.headers['authorization'] || req.query.secret;
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && triggerAuth !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized secret credentials.' });
  }

  if (req.query.job === 'inactivity') {
    return runInactivitySweep(supabase, res);
  }

  try {
    // 1. Fetch all active push subscriptions, plus the users/clients/tracker_logs
    // tables needed per-subscriber below — fetched once up front via RPC (see
    // BROADCAST_SECRET note above) rather than per-subscriber .eq() queries, both
    // because those direct reads return nothing for this anon-key server client and
    // because it's cheaper to filter these small tables in memory once.
    let subscribers, allUsers, allClients, allTrackerLogs;
    try {
      [subscribers, allUsers, allClients, allTrackerLogs] = await Promise.all([
        rpcAll(supabase, 'get_push_subscriptions_for_broadcast'),
        rpcAll(supabase, 'get_users_for_server'),
        rpcAll(supabase, 'get_clients_for_server'),
        rpcAll(supabase, 'get_tracker_logs_for_server')
      ]);
    } catch (rpcError) {
      if (rpcError.message?.includes('does not exist')) {
        return res.status(200).json({ message: 'No subscriptions found because push_subscriptions table does not exist.' });
      }
      throw rpcError;
    }

    if (!subscribers || subscribers.length === 0) {
      return res.status(200).json({ success: true, message: 'Zero subscribers found. Fired 0 notifications.' });
    }

    const now = new Date();
    // Vercel Cron runs in UTC, let's convert to Indian Standard Time (IST - UTC+5:30) as default or read local hours
    const utcHours = now.getUTCHours();
    const istHours = (utcHours + 5.5) % 24;
    const hours = Math.floor(istHours); 

    // Only nudge between 8 AM and 10 PM IST
    if (hours < 8 || hours > 22) {
      return res.status(200).json({
        success: true,
        message: `Current IST hour is ${hours}. Skipping notification broadcasts during sleeping hours (10PM - 8AM).`
      });
    }

    const dateStr = now.toISOString().split('T')[0];
    let successCount = 0;
    let failureCount = 0;

    // 2. Loop through subscribers and fetch their real-time targets & logs
    for (const sub of subscribers) {
      const userName = sub.user_name || 'Warrior';
      // Use the email saved in subscription json metadata if available, otherwise fall back to constructed email
      const email = sub.subscription.userEmail || `${userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;

      let title = "Fitengineers Coach 🥗";
      let body = "Stay focused on your wellness habits today. Consistency is key! ✨";

      try {
        // Fetch user targets
        const userProfile = allUsers.find((u) => u.email === email) || null;

        let calorieTarget = 1800;
        let proteinTarget = 100;
        let weight = 70;

        if (userProfile) {
          calorieTarget = userProfile.calorie_target || 1800;
          proteinTarget = userProfile.protein_target || 100;
          weight = userProfile.weight_kg || 70;
        }

        // Fetch today's logs
        let waterGlasses = 0;
        let steps = 0;
        let loggedProtein = 0;
        let loggedCalories = 0;

        if (userProfile) {
          const logToday = allTrackerLogs.find((l) => l.user_id === userProfile.id && l.log_date === dateStr) || null;

          if (logToday) {
            waterGlasses = logToday.water_glasses || 0;
            steps = logToday.synced_steps || 0;
            loggedCalories = logToday.logged_calories || 0;
            loggedProtein = logToday.logged_protein || 0;
          }
        }

        // Compute recommended water target
        const baseCalorieGlasses = calorieTarget / 250;
        const baseWeightGlasses = (weight * 35) / 250;
        const baselineTarget = Math.round((baseCalorieGlasses + baseWeightGlasses) / 2);
        const stepBooster = Math.floor(steps / 3000);
        const proteinBooster = proteinTarget > 100 ? 1 : 0;
        const recommendedWaterTarget = Math.max(6, baselineTarget + stepBooster + proteinBooster);
        const glassesLeft = Math.max(0, recommendedWaterTarget - waterGlasses);

        // Compute protein target
        let finalProtein = loggedProtein;
        if (finalProtein === 0 && loggedCalories > 0) {
          finalProtein = Math.round(proteinTarget * (loggedCalories / calorieTarget));
        }
        const proteinLeft = Math.max(0, proteinTarget - finalProtein);

        // Only coach-connected clients receive the wellness schedule.
        if (userProfile) {
          const clientRow = allClients.find((c) => c.user_id === userProfile.id) || null;
          if (!clientRow || !clientRow.coach_id) {
            continue; // no coach — skip this subscriber
          }
        }

        // 3. Compose the day's supportive slot. IST slot hours: 8 morning,
        //    11 brunch, 13 lunch, 19 dinner (19:30), 21 evening (21:30).
        //    Hydration figure is woven into the brunch message.
        if (hours === 8) {
          title = `Good Morning, ${userName} ☀️`;
          body = morningQuotes[now.getDate() % morningQuotes.length];
        } else if (hours === 11) {
          title = "Mid-Morning Reset 🚶";
          body = `Time for a short reset, ${userName}. Take a 5–10 minute walk to loosen up, and keep your hydration steady${glassesLeft > 0 ? ` — about ${glassesLeft} more glasses to reach today's target` : ''}. Small habits, big results. 💧`;
        } else if (hours === 13) {
          title = "Post-Lunch Movement 🍱";
          body = `Try not to sit right after lunch, ${userName}. A gentle 10-minute walk now supports your digestion and metabolism, and keeps your energy steady through the afternoon. 🌿`;
        } else if (hours === 19) {
          title = "Dinner Reminder 🍽️";
          body = proteinLeft > 0
            ? `Time to wind down with dinner. Focus on a high-protein, balanced plate${proteinLeft > 0 ? ` — around ${proteinLeft}g of protein left for today` : ''} to support your recovery. Try to eat a little earlier so your body can rest well tonight. 🥗`
            : `Time to wind down with dinner. Focus on a high-protein, balanced plate to support your recovery and strength. Try to eat a little earlier so your body can rest well tonight. 🥗`;
        } else if (hours === 21) {
          title = "Well Done Today 🌙";
          body = `You showed up and gave your best today, ${userName}, and that matters. Rest deeply tonight, let your body recover, and we'll do it all again tomorrow. Proud of you. ✨`;
        } else {
          // Not a scheduled slot for this run — don't send anything.
          continue;
        }

        // 4. Send Web Push
        const payload = JSON.stringify({
          title,
          body,
          icon: '/logo.png',
          vibrate: [300, 100, 300, 100, 300]
        });

        await webPush.sendNotification(sub.subscription, payload);
        successCount++;
      } catch (err) {
        console.error(`Failed to notify subscriber ${sub.id}:`, err);
        failureCount++;
        // If subscription is invalid (expired/blocked), remove it from Supabase
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`Subscription expired (status ${err.statusCode}). Cleaning up database.`);
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Hourly nudge cycle triggered. Notifications sent: ${successCount} successful, ${failureCount} failed. IST Hour: ${hours}`
    });
  } catch (error) {
    console.error('Nudge broadcast error:', error);
    return res.status(500).json({ error: 'Nudge cycle failed.', details: error.message });
  }
}
