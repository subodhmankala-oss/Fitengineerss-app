// Consolidated push-notification endpoint — merged from four formerly
// separate functions (send-nudges.js, notify-user.js, subscribe.js,
// test-nudge.js) purely to stay under the Vercel Hobby plan's 12-Serverless-
// Functions-per-deployment cap (2026-08-11: 17 api/*.js files, every deploy
// failing with "No more than 12 Serverless Functions can be added to a
// Deployment on the Hobby plan"). Each original file's handler logic is
// preserved verbatim below as its own function; this file only adds the
// `action` dispatch.
//
// Public URLs are unchanged via vercel.json rewrites:
//   /api/send-nudges          -> /api/push                       (no action = original default/cron behavior, job=... still works)
//   /api/notify-user          -> /api/push?action=notify-user
//   /api/subscribe            -> /api/push?action=subscribe
//   /api/test-nudge           -> /api/push?action=test-nudge
// vercel.json's cron entries hit /api/send-nudges (and
// /api/send-nudges?job=inactivity) directly, which the rewrite above sends
// here with no `action` set — so the default branch below must keep
// behaving exactly like the old send-nudges.js default export.

import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';
// Reused verbatim from the in-app Muscle Analytics screen (see that file's
// header) rather than re-implemented here, so the weekly muscle-balance
// nudge (runMuscleBalanceSweep below) can never drift from what the client
// actually sees when they open that screen themselves. Pure logic, no
// browser globals (window/document/localStorage) — safe in this serverless
// runtime, confirmed 2026-08-11.
import { getWeeklyMuscleStats, RECOMMENDED_EXERCISES } from '../src/utils/muscleAnalytics.js';
import { getLocalDateString, parseLocalDateString, shiftLocalDateString } from '../src/utils/dateUtils.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

webPush.setVapidDetails(
  'mailto:support@fitengineers.com',
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// sql/lock_down_reads.sql gates SELECT on users/clients/coaches/tracker_logs/
// push_subscriptions to auth.uid()-derived checks. This code runs server-side
// with the anon key and no user session, so auth.uid() is NULL and direct
// .from().select() reads on those tables silently return zero rows. The
// get_*_for_server / get_push_subscriptions_for_broadcast RPCs
// (sql/server_reads_rpc.sql, sql/push_subscriptions_broadcast_rpc.sql) are
// SECURITY DEFINER, secret-gated escape hatches for exactly this case —
// writes (insert/update/delete) are unaffected and still go through the
// normal client.
const BROADCAST_SECRET = process.env.BROADCAST_SECRET;

async function rpcAll(supabaseClient, fn) {
  if (!BROADCAST_SECRET) throw new Error(`BROADCAST_SECRET is not set — required for ${fn}.`);
  const { data, error } = await supabaseClient.rpc(fn, { secret: BROADCAST_SECRET });
  if (error) throw error;
  return data || [];
}

// One row per logical notification (per recipient per event) so "how many
// push notifications are we sending per day" is a real query — see
// sql/supabase_push_log.sql. Best-effort: a logging failure must never break
// the actual notification send it's recording, so this only ever warns.
async function logPushSend(supabaseClient, { event, targetUserId, title, body, sent, failed }) {
  try {
    await supabaseClient.from('push_log').insert({
      event,
      target_user_id: targetUserId || null,
      title: title || null,
      body: body || null,
      sent_count: sent || 0,
      failed_count: failed || 0
    });
  } catch (e) {
    console.warn('[push_log] failed to record send (non-fatal):', e.message || e);
  }
}

// ════════════════════════════════════════════════════════════════════════
// ─── send-nudges.js (default behavior — hourly wellness cycle + cron
//     job=inactivity sweep) ───
// ════════════════════════════════════════════════════════════════════════

const morningQuotes = [
  "Good morning. Today is another chance to invest in yourself — one steady, intentional choice at a time. Let's make it count. ☀️",
  "Rise and shine. Progress is built on consistency, not perfection. Show up for yourself today and the results will follow. 💪",
  "Good morning. Your body is capable of remarkable things when you treat it with care. Start today strong and hydrated. 🌿",
  "A fresh morning, a fresh start. Small disciplined actions today become the strength you'll be proud of tomorrow. 🌅",
  "Good morning. Fuel your body well, move with purpose, and be kind to yourself. You've got everything it takes. 🙌"
];

function daysSinceLogin(lastLogin) {
  if (!lastLogin) return null;
  return Math.floor((Date.now() - new Date(lastLogin).getTime()) / (24 * 60 * 60 * 1000));
}

// Only fires at 3+ days quiet (see runInactivitySweep's own `days < 3` skip
// below) — days 1-2 no longer get a client-facing nudge at all. Deliberately
// drops the old "X days and counting"/"let's restart" framing: that's exactly
// the guilt-driven language the Welcome Back screen (WelcomeBackScreen.jsx)
// was built to avoid ("you missed X days", "you're falling behind", "get
// back on track"). Same warm/low-pressure tone here — the notification's job
// is just to get them to open the app; the actual re-engagement moment lives
// in the Welcome Back screen itself.
function clientInactivityMessage(name, days) {
  if (days < 7) {
    return {
      title: `👀 Look who we're thinking about, ${name}`,
      body: "Your progress didn't go anywhere — it's exactly where you left it. Got a few minutes today? We'd love to see you back. 😄"
    };
  }
  return {
    title: `We saved your spot, ${name} 🙌`,
    body: "No pressure, no countdown — just a friendly nudge that Fitengineers (and your progress) is still here whenever you're ready."
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

async function pushToUserId(supabaseClient, userId, title, body, event = 'inactivity_nudge', url = null) {
  if (!userId) return { sent: 0, failed: 0 };
  const allSubs = await rpcAll(supabaseClient, 'get_push_subscriptions_for_broadcast');
  const subs = allSubs.filter((s) => s.user_id === userId);
  if (!subs || subs.length === 0) return { sent: 0, failed: 0 };
  // sw.js's push handler reads this and sets it as the notification's
  // click-through target — without it, every notification opens the bare
  // homepage no matter how specific its own text is (confirmed 2026-08-12).
  const payload = JSON.stringify({ title, body, icon: '/logo.png', vibrate: [300, 100, 300], url: url || undefined });
  let sent = 0, failed = 0;
  for (const sub of subs) {
    try {
      await webPush.sendNotification(sub.subscription, payload);
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabaseClient.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }
  await logPushSend(supabaseClient, { event, targetUserId: userId, title, body, sent, failed });
  return { sent, failed };
}

async function runInactivitySweep(supabaseClient, res) {
  try {
    const users = await rpcAll(supabaseClient, 'get_users_for_server');
    const clientRows = await rpcAll(supabaseClient, 'get_clients_for_server');
    const coachRows = await rpcAll(supabaseClient, 'get_coaches_for_server');

    let clientNudges = 0, coachNudges = 0, coachAlerts = 0, skipped = 0;

    for (const u of users || []) {
      const days = daysSinceLogin(u.last_login);
      if (days === null || days < 1) { skipped++; continue; } // never logged in, or active today

      const clientRow = (clientRows || []).find((c) => c.user_id === u.id);
      const coachRow = (coachRows || []).find((c) => c.user_id === u.id && c.status === 'approved');

      if (clientRow) {
        // Client-facing nudge only starts at 3+ days quiet — see
        // clientInactivityMessage's own comment for why days 1-2 no longer
        // get a push at all. Coach-self and coach-about-client nudges below
        // are a separate concern and keep their own existing thresholds.
        if (days < 3) { skipped++; continue; }

        const name = clientRow.full_name || u.full_name || 'there';
        const msg = clientInactivityMessage(name, days);
        const result = await pushToUserId(supabaseClient, u.id, msg.title, msg.body, 'client_inactivity_nudge');
        if (result.sent > 0) clientNudges++;

        // Same 3+ day threshold as the client's own nudge above (was 2+) —
        // keeps the coach alert from firing a day before the client ever
        // gets nudged themselves, since both read the same "client gone
        // quiet" signal.
        if (clientRow.coach_id) {
          const alert = coachAboutInactiveClientMessage(name, days);
          // Deep-link straight to this client's profile (same ?viewClient=
          // pattern as the other coach-facing pushes below) so tapping the
          // notification lands the coach right where they'd send the nudge,
          // instead of the bare homepage.
          const coachResult = await pushToUserId(supabaseClient, clientRow.coach_id, alert.title, alert.body, 'coach_inactive_client_alert', `/?viewClient=${u.id}`);
          if (coachResult.sent > 0) coachAlerts++;
        }
      } else if (coachRow) {
        const name = coachRow.brand_name || u.full_name || 'there';
        const msg = coachSelfInactivityMessage(name, days);
        const result = await pushToUserId(supabaseClient, u.id, msg.title, msg.body, 'coach_self_inactivity_nudge');
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

// Monday-Sunday week containing "now", anchored to IST regardless of this
// function's actual server runtime timezone (Vercel runs UTC) — matches the
// same week the client sees on their own Muscle Analytics screen, since
// every other IST-hour check in this file (see the wellness cycle below)
// already assumes IST is the app's reference timezone. Once anchored to the
// correct IST calendar day, shiftLocalDateString's day-integer arithmetic is
// timezone-agnostic, so no further timezone handling is needed past this.
function getIstWeekBounds(now = new Date()) {
  const todayIst = getLocalDateString(now, 'Asia/Kolkata');
  const dayOfWeek = parseLocalDateString(todayIst).getDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = shiftLocalDateString(todayIst, diffToMonday);
  const weekEnd = shiftLocalDateString(weekStart, 6);
  return { weekStart, weekEnd };
}

async function rpcRecentWorkoutLogs(supabaseClient, sinceDateStr) {
  if (!BROADCAST_SECRET) throw new Error('BROADCAST_SECRET is not set — required for get_recent_workout_logs_for_server.');
  const { data, error } = await supabaseClient.rpc('get_recent_workout_logs_for_server', {
    secret: BROADCAST_SECRET,
    since_date: sinceDateStr
  });
  if (error) throw error;
  return data || [];
}

// Weekly "you still have time this week" nudge — reuses getWeeklyMuscleStats
// (the exact function driving the in-app Muscle Analytics screen) to find
// muscles with zero sets logged so far this week, and points at
// RECOMMENDED_EXERCISES to fix it. Deliberately narrow triggering conditions:
// only fires for a client who's ALREADY trained at least once this week (so
// it never overlaps with/duplicates the separate inactivity nudge, which
// already covers "you haven't worked out at all") but still has a genuinely
// neglected muscle. See sql/get_recent_workout_logs_for_server.sql for the
// RPC this depends on.
async function runMuscleBalanceSweep(supabaseClient, res) {
  try {
    const { weekStart, weekEnd } = getIstWeekBounds();
    const clientRows = await rpcAll(supabaseClient, 'get_clients_for_server');
    const logs = await rpcRecentWorkoutLogs(supabaseClient, weekStart);

    let notified = 0, skipped = 0;
    for (const client of clientRows || []) {
      const clientLogs = logs.filter((l) => l.user_id === client.user_id);
      const stats = getWeeklyMuscleStats(clientLogs, weekStart, weekEnd);
      const hasTrainedThisWeek = stats.some((m) => m.sets > 0);
      const neglected = stats.filter((m) => m.status.key === 'neglected');

      if (!hasTrainedThisWeek || neglected.length === 0) { skipped++; continue; }

      const topMuscles = neglected.slice(0, 2).map((m) => m.muscle);
      const muscleText = topMuscles.join(' and ');
      const isPlural = topMuscles.length > 1;
      const exercises = RECOMMENDED_EXERCISES[neglected[0].muscle] || [];

      const title = '🎯 Muscle Balance Check';
      const body = exercises.length > 0
        ? `Your ${muscleText} ${isPlural ? 'are' : 'is'} trained less this week — let's cover it up. Try ${exercises.slice(0, 2).join(' or ')}.`
        : `Your ${muscleText} ${isPlural ? 'are' : 'is'} trained less this week — let's cover it up before the week ends.`;

      const result = await pushToUserId(supabaseClient, client.user_id, title, body, 'muscle_balance_nudge');
      if (result.sent > 0) notified++;
    }

    return res.status(200).json({
      success: true,
      message: `Muscle balance sweep complete (week ${weekStart} to ${weekEnd}). Notified: ${notified}, skipped (idle or fully balanced): ${skipped}.`
    });
  } catch (error) {
    console.error('Muscle balance sweep error:', error);
    return res.status(500).json({ error: 'Muscle balance sweep failed.', details: error.message });
  }
}

async function rpcBodyMeasurements(supabaseClient) {
  if (!BROADCAST_SECRET) throw new Error('BROADCAST_SECRET is not set — required for get_body_measurements_for_server.');
  const { data, error } = await supabaseClient.rpc('get_body_measurements_for_server', { secret: BROADCAST_SECRET });
  if (error) throw error;
  return data || [];
}

// Nudges a client to log fresh body measurements, and separately tells their
// coach to follow up, once 15+ days have passed since the last one — the
// same cadence the app's own Measurements form already enforces client-side
// (see sql/supabase_body_measurements.sql's header). Runs daily; the
// `daysSince % 15 === 0` check is what makes a daily cron self-dedupe into a
// once-per-15-days reminder without needing a separate "already sent" log —
// it only fires on the exact day the count crosses each 15-day multiple (15,
// 30, 45, ...), and naturally repeats for as long as the client stays
// non-compliant. A brand new client with zero measurements ever is anchored
// to their account created_at, so day 15 after SIGNUP is their first nudge,
// not an immediate one.
async function runMeasurementReminderSweep(supabaseClient, res) {
  try {
    const clientRows = await rpcAll(supabaseClient, 'get_clients_for_server');
    const usersRows = await rpcAll(supabaseClient, 'get_users_for_server');
    const measurements = await rpcBodyMeasurements(supabaseClient);

    const lastMeasuredByUser = new Map();
    measurements.forEach((m) => {
      const existing = lastMeasuredByUser.get(m.user_id);
      const at = new Date(m.measured_at);
      if (!existing || at > existing) lastMeasuredByUser.set(m.user_id, at);
    });
    const usersById = new Map(usersRows.map((u) => [u.id, u]));

    const now = new Date();
    let clientsNotified = 0, coachesNotified = 0, skipped = 0;

    for (const client of clientRows || []) {
      const anchor = lastMeasuredByUser.get(client.user_id) || new Date(usersById.get(client.user_id)?.created_at || now);
      const daysSince = Math.floor((now.getTime() - anchor.getTime()) / 86_400_000);

      if (daysSince < 15 || daysSince % 15 !== 0) { skipped++; continue; }

      const clientName = client.full_name || 'there';

      const clientResult = await pushToUserId(
        supabaseClient,
        client.user_id,
        '📏 Time for a Measurement Update',
        `It's been ${daysSince} days since your last measurement log — take a couple minutes to log fresh numbers and track your progress.`,
        'measurement_reminder_client',
        // Deep link: App.jsx reads this query param on load and jumps
        // straight to Profile > Measurements instead of the bare homepage.
        '/?openMeasurements=1'
      );
      if (clientResult.sent > 0) clientsNotified++;

      if (client.coach_id) {
        const coachResult = await pushToUserId(
          supabaseClient,
          client.coach_id,
          '📏 Measurement Check-in Needed',
          `${clientName} hasn't logged measurements in ${daysSince} days — a quick nudge from you could help them stay on track.`,
          'measurement_reminder_coach',
          // Deep link: opens this exact client's profile in the coach
          // dashboard, where the new "Send Measurement Reminder" button
          // (TrainerDashboard.jsx) lets the coach act on it immediately.
          `/?viewClient=${client.user_id}`
        );
        if (coachResult.sent > 0) coachesNotified++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Measurement reminder sweep complete. Clients notified: ${clientsNotified}, coaches notified: ${coachesNotified}, skipped (not yet due): ${skipped}.`
    });
  } catch (error) {
    console.error('Measurement reminder sweep error:', error);
    return res.status(500).json({ error: 'Measurement reminder sweep failed.', details: error.message });
  }
}

async function handleSendNudges(req, res) {
  // Optional: Add simple secret key security for trigger
  const triggerAuth = req.headers['authorization'] || req.query.secret;
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && triggerAuth !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized secret credentials.' });
  }

  if (req.query.job === 'inactivity') {
    return runInactivitySweep(supabase, res);
  }
  if (req.query.job === 'muscle_balance') {
    return runMuscleBalanceSweep(supabase, res);
  }
  if (req.query.job === 'measurement_reminder') {
    return runMeasurementReminderSweep(supabase, res);
  }

  try {
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
    const utcHours = now.getUTCHours();
    const istHours = (utcHours + 5.5) % 24;
    const hours = Math.floor(istHours);

    if (hours < 8 || hours > 22) {
      return res.status(200).json({
        success: true,
        message: `Current IST hour is ${hours}. Skipping notification broadcasts during sleeping hours (10PM - 8AM).`
      });
    }

    const dateStr = now.toISOString().split('T')[0];
    let successCount = 0;
    let failureCount = 0;

    for (const sub of subscribers) {
      const userName = sub.user_name || 'Warrior';
      const email = sub.subscription.userEmail || `${userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;

      let title = "Fitengineers Coach 🥗";
      let body = "Stay focused on your wellness habits today. Consistency is key! ✨";

      try {
        const userProfile = allUsers.find((u) => u.email === email) || null;

        let calorieTarget = 1800;
        let proteinTarget = 100;
        let weight = 70;

        if (userProfile) {
          calorieTarget = userProfile.calorie_target || 1800;
          proteinTarget = userProfile.protein_target || 100;
          weight = userProfile.weight_kg || 70;
        }

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

        const baseCalorieGlasses = calorieTarget / 250;
        const baseWeightGlasses = (weight * 35) / 250;
        const baselineTarget = Math.round((baseCalorieGlasses + baseWeightGlasses) / 2);
        const stepBooster = Math.floor(steps / 3000);
        const proteinBooster = proteinTarget > 100 ? 1 : 0;
        const recommendedWaterTarget = Math.max(6, baselineTarget + stepBooster + proteinBooster);
        const glassesLeft = Math.max(0, recommendedWaterTarget - waterGlasses);

        let finalProtein = loggedProtein;
        if (finalProtein === 0 && loggedCalories > 0) {
          finalProtein = Math.round(proteinTarget * (loggedCalories / calorieTarget));
        }
        const proteinLeft = Math.max(0, proteinTarget - finalProtein);

        if (userProfile) {
          const clientRow = allClients.find((c) => c.user_id === userProfile.id) || null;
          if (!clientRow || !clientRow.coach_id) {
            continue; // no coach — skip this subscriber
          }
        }

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
          continue;
        }

        const payload = JSON.stringify({
          title,
          body,
          icon: '/logo.png',
          vibrate: [300, 100, 300, 100, 300]
        });

        await webPush.sendNotification(sub.subscription, payload);
        successCount++;
        await logPushSend(supabase, { event: 'wellness_nudge', targetUserId: sub.user_id, title, body, sent: 1, failed: 0 });
      } catch (err) {
        console.error(`Failed to notify subscriber ${sub.id}:`, err);
        failureCount++;
        await logPushSend(supabase, { event: 'wellness_nudge', targetUserId: sub.user_id, title, body, sent: 0, failed: 1 });
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

// ════════════════════════════════════════════════════════════════════════
// ─── notify-user.js (action=notify-user) ───
// ════════════════════════════════════════════════════════════════════════

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same hardcoded super-admin identity App.jsx's processSessionUser uses to
// grant the super-admin role — kept in sync deliberately rather than reading
// a role column, since that's the one account this alert must always reach
// regardless of DB role drift.
const SUPER_ADMIN_EMAIL = 'subodhmankala@gmail.com';

async function getUserContact(userId) {
  const users = await rpcAll(supabase, 'get_users_for_server');
  const user = users.find((u) => u.id === userId);
  return user ? { email: user.email, full_name: user.full_name } : null;
}

async function getSuperAdminUserId() {
  const users = await rpcAll(supabase, 'get_users_for_server');
  const admin = users.find((u) => (u.email || '').toLowerCase() === SUPER_ADMIN_EMAIL);
  return admin?.id || null;
}

// Role-based version for the "notify every super-admin" case (custom
// exercise creation) — getSuperAdminUserId above only ever resolves the one
// hardcoded SUPER_ADMIN_EMAIL account, but role='super-admin' can be
// granted to more than one user.
async function getSuperAdminUserIds() {
  const users = await rpcAll(supabase, 'get_users_for_server');
  return users.filter((u) => u.role === 'super-admin').map((u) => u.id);
}

async function findSubscriptions(targetUserId, email, name) {
  const all = await rpcAll(supabase, 'get_push_subscriptions_for_broadcast');
  const byEndpoint = new Map();
  for (const r of all) {
    const matches = r.user_id === targetUserId
      || (email && r.subscription?.userEmail === email)
      || (name && r.user_name === name);
    if (matches) byEndpoint.set(r.endpoint, r);
  }
  return Array.from(byEndpoint.values());
}

async function pushToUser(targetUserId, title, body, event = 'notify_user', url = null) {
  const contact = await getUserContact(targetUserId);
  const subs = await findSubscriptions(targetUserId, contact?.email, contact?.full_name);
  if (!subs || subs.length === 0) return { sent: 0, failed: 0, matched: 0 };

  const payload = JSON.stringify({ title, body, icon: '/logo.png', vibrate: [300, 100, 300], url: url || undefined });
  let sent = 0, failed = 0;
  for (const sub of subs) {
    try {
      await webPush.sendNotification(sub.subscription, payload);
      if (!sub.user_id) {
        await supabase.from('push_subscriptions').update({ user_id: targetUserId }).eq('id', sub.id);
      }
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }
  await logPushSend(supabase, { event, targetUserId, title, body, sent, failed });
  return { sent, failed, matched: subs.length };
}

async function getClientRow(clientUserId) {
  const clients = await rpcAll(supabase, 'get_clients_for_server');
  const row = clients.find((c) => c.user_id === clientUserId);
  return row ? { coach_id: row.coach_id, full_name: row.full_name } : null;
}

async function getCoachDisplayName(coachId) {
  if (!coachId) return 'Your Coach';
  const contact = await getUserContact(coachId);
  return contact?.full_name || 'Your Coach';
}

async function handleNotifyUser(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { event, clientUserId, planName, durationSeconds, caloriesBurned, workoutName, message, sessionsLeft, oldCoachId, exerciseName, creatorRole, creatorName } = req.body || {};
  if (!event || !clientUserId || !UUID_RE.test(clientUserId)) {
    return res.status(400).json({ error: 'event and a valid clientUserId are required.' });
  }

  try {
    const client = await getClientRow(clientUserId);
    const clientName = client?.full_name || 'Your client';

    let targetUserId = null;
    let title = '';
    let body = '';
    let url = null;

    if (event === 'workout_started') {
      if (!client?.coach_id) return res.status(200).json({ success: true, message: 'Client has no coach; nothing to send.' });
      targetUserId = client.coach_id;
      title = clientName;
      // workoutName was already being sent by the "completed" event but
      // never read here — this event never received it from the client at
      // all until now (see WorkoutTracker.jsx's handleToggleSetCompleted).
      body = workoutName ? `Started "${workoutName}" session` : 'Session started';
    } else if (event === 'measurements_saved') {
      if (!client?.coach_id) return res.status(200).json({ success: true, message: 'Client has no coach; nothing to send.' });
      targetUserId = client.coach_id;
      title = clientName;
      body = 'Updated body measurements';
    } else if (event === 'workout_finished') {
      if (!client?.coach_id) return res.status(200).json({ success: true, message: 'Client has no coach; nothing to send.' });
      targetUserId = client.coach_id;
      const mins = Number.isFinite(durationSeconds) ? Math.max(1, Math.round(durationSeconds / 60)) : null;
      const cals = Number.isFinite(caloriesBurned) ? Math.round(caloriesBurned) : null;
      const stats = [mins != null ? `${mins} min` : null, cals != null ? `${cals} kcal` : null].filter(Boolean).join(' · ');
      title = clientName;
      // workoutName was already sent by the client (see WorkoutTracker.jsx's
      // notifyEvent('workout_finished', ...)) but silently dropped here —
      // req.body destructures it above but this branch never read it.
      body = workoutName
        ? `"${workoutName}" completed${stats ? ` — ${stats}` : ''}`
        : `Workout completed${stats ? ` — ${stats}` : ''}`;
    } else if (event === 'coach_note') {
      if (!message || !message.trim()) return res.status(400).json({ error: 'message is required for coach_note.' });
      targetUserId = clientUserId;
      title = await getCoachDisplayName(client?.coach_id);
      body = message.trim();
    } else if (event === 'client_reply') {
      if (!message || !message.trim()) return res.status(400).json({ error: 'message is required for client_reply.' });
      if (!client?.coach_id) return res.status(200).json({ success: true, message: 'Client has no coach; nothing to send.' });
      targetUserId = client.coach_id;
      title = clientName;
      body = message.trim();
    } else if (event === 'session_reminder') {
      targetUserId = clientUserId;
      const left = Number.isFinite(sessionsLeft) ? sessionsLeft : null;
      title = await getCoachDisplayName(client?.coach_id);
      body = left != null
        ? `${left} session${left === 1 ? '' : 's'} left — talk to your coach about renewing`
        : 'Session package running low — talk to your coach about renewing';
    } else if (event === 'client_disconnected') {
      if (!oldCoachId) return res.status(200).json({ success: true, message: 'No coach to notify.' });
      targetUserId = oldCoachId;
      title = clientName;
      body = 'Package ended — moved to unattached clients';
    } else if (event === 'client_connected') {
      // Fired right after connectClientToCoach's link transaction commits
      // (WorkoutProgressDashboard.jsx's ConnectCoachModal onSuccess) — covers
      // both a brand-new client attaching via invite code AND an existing
      // client reattaching/renewing with the same coach on a fresh code; the
      // coach just sees "you have this client now" either way. getClientRow
      // reads the `clients` table, which the link transaction has already
      // committed to by the time this fires, so client.coach_id here is
      // already the NEW coach. Previously nothing notified the coach at all
      // for this event — confirmed missing 2026-08-16.
      if (!client?.coach_id) return res.status(200).json({ success: true, message: 'Client has no coach; nothing to send.' });
      targetUserId = client.coach_id;
      title = '🔗 New client connected';
      body = `${clientName} just connected to you as their coach.`;
      url = `/?viewClient=${clientUserId}`;
    } else if (event === 'plan_assigned') {
      targetUserId = clientUserId;
      title = await getCoachDisplayName(client?.coach_id);
      body = planName ? `Sent you a new plan: "${planName}"` : 'Sent you a new workout plan';
    } else if (event === 'measurement_reminder_manual') {
      // Coach-triggered version of the automated 15-day sweep's client push
      // (runMeasurementReminderSweep) — same message/deep-link, but fired on
      // demand from the "Send Measurement Reminder" button on a client's
      // profile (TrainerDashboard.jsx) instead of waiting for the cron.
      targetUserId = clientUserId;
      title = '📏 Time for a Measurement Update';
      body = `${await getCoachDisplayName(client?.coach_id)} would like you to log fresh measurements — take a couple minutes to update your progress.`;
      url = '/?openMeasurements=1';
    } else if (event === 'new_client_signup') {
      // Fired once per account from api/complete-onboarding.js (that endpoint
      // only ever runs for a client who hasn't finished the one-time wizard
      // yet, so every call here really is a brand-new client) — lets the
      // super-admin see growth happen live instead of checking the dashboard.
      const adminId = await getSuperAdminUserId();
      if (!adminId) return res.status(200).json({ success: true, message: 'Super-admin has no account; nothing to send.' });
      targetUserId = adminId;
      title = '🎉 New client joined';
      body = `${clientName} just signed up on Fitengineers.`;
      url = `/?viewClient=${clientUserId}`;
    } else if (event === 'custom_exercise_created') {
      // Fired from databaseService.createCustomExercise right after a coach
      // or client saves a new custom exercise from the Add Exercise
      // picker's "Create" row — fans out to every role='super-admin'
      // account, each getting its own push_log row via pushToUser below.
      const adminIds = await getSuperAdminUserIds();
      if (adminIds.length === 0) return res.status(200).json({ success: true, message: 'No super-admin accounts; nothing to send.' });
      title = '🏷️ New custom exercise';
      body = `${creatorName || (creatorRole === 'coach' ? 'A coach' : 'A client')} created "${exerciseName || 'a new exercise'}"${creatorRole === 'coach' ? ` for ${clientName}` : ''}.`;
      let sent = 0, failed = 0;
      for (const adminId of adminIds) {
        const r = await pushToUser(adminId, title, body, event, null);
        sent += r.sent; failed += r.failed;
      }
      return res.status(200).json({ success: true, event, sent, failed, matched: adminIds.length });
    } else {
      return res.status(400).json({ error: `Unknown event "${event}".` });
    }

    const result = await pushToUser(targetUserId, title, body, event, url);
    return res.status(200).json({ success: true, event, ...result });
  } catch (error) {
    console.error('notify-user error:', error);
    return res.status(500).json({ error: 'Notification failed.', details: error.message });
  }
}

// ════════════════════════════════════════════════════════════════════════
// ─── subscribe.js (action=subscribe, POST or DELETE) ───
// ════════════════════════════════════════════════════════════════════════

async function handleSubscribe(req, res) {
  if (req.method === 'DELETE') {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required.' });
    try {
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Push Subscription Removal Error:', error);
      return res.status(500).json({ error: 'Failed to unsubscribe.', details: error.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Please use POST or DELETE.' });
  }

  const { userName, subscription, userId } = req.body;

  if (!userName || !subscription) {
    return res.status(400).json({ error: 'userName and subscription parameters are required.' });
  }

  const validUserId = (typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))
    ? userId
    : null;

  try {
    const endpoint = subscription.endpoint;

    const fields = { user_name: userName, endpoint, subscription };
    if (validUserId) fields.user_id = validUserId;

    const { error: insertError } = await supabase
      .from('push_subscriptions')
      .insert(fields);

    if (insertError) {
      if (insertError.message?.includes('does not exist')) {
        return res.status(500).json({
          error: 'Supabase push_subscriptions table does not exist. Please create the table in your Supabase SQL Editor.',
          sql: `
            CREATE TABLE IF NOT EXISTS push_subscriptions (
              id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
              user_name TEXT NOT NULL,
              endpoint TEXT NOT NULL UNIQUE,
              subscription JSONB NOT NULL,
              created_at TIMESTAMPTZ DEFAULT now()
            );
          `
        });
      }

      if (insertError.code === '23505') {
        const { error: updateError } = await supabase
          .from('push_subscriptions')
          .update(fields)
          .eq('endpoint', endpoint);
        if (updateError) throw updateError;
      } else {
        throw insertError;
      }
    }

    return res.status(200).json({ success: true, message: 'Push subscription registered successfully.' });
  } catch (error) {
    console.error('Push Subscription Registration Error:', error);
    return res.status(500).json({ error: 'Failed to register subscription.', details: error.message });
  }
}

// ════════════════════════════════════════════════════════════════════════
// ─── test-nudge.js (action=test-nudge) ───
// ════════════════════════════════════════════════════════════════════════

async function handleTestNudge(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Please use POST.' });
  }

  const { subscription, userName } = req.body;

  if (!subscription) {
    return res.status(400).json({ error: 'subscription parameter is required.' });
  }

  try {
    const title = "Fitengineers Test Nudge 🥗";
    const body = `Hey ${userName || 'Warrior'}! This is a test push notification. If you received this, your mobile push pipeline is 100% active and working in the background! 💪`;

    const payload = JSON.stringify({
      title,
      body,
      icon: '/logo.png',
      vibrate: [300, 100, 300, 100, 300]
    });

    await webPush.sendNotification(subscription, payload);

    return res.status(200).json({ success: true, message: 'Test notification sent successfully.' });
  } catch (error) {
    console.error('Test Push Notification Error:', error);
    return res.status(500).json({ error: 'Failed to send test push notification.', details: error.message });
  }
}

// ════════════════════════════════════════════════════════════════════════
// ─── dispatch ───
// ════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query?.action;
  if (action === 'notify-user') return handleNotifyUser(req, res);
  if (action === 'subscribe') return handleSubscribe(req, res);
  if (action === 'test-nudge') return handleTestNudge(req, res);

  // No action = original send-nudges.js default export (hourly cycle, or
  // the job=inactivity sweep) — this is what vercel.json's cron entries hit.
  return handleSendNudges(req, res);
}
