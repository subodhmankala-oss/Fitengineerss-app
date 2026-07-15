import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://wzifwepqggyqkylyxqcx.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6aWZ3ZXBxZ2d5cWt5bHl4cWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODE4NjE5NjIsImV4cCI6MTk5NzQzNzk2Mn0.a452hS-sR6c_g0W1Z_37_0';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Set VAPID keys
webPush.setVapidDetails(
  'mailto:support@fitengineers.com',
  process.env.VITE_VAPID_PUBLIC_KEY || 'BIupVfv6kg0G6uCsUWYciNynMR5xs6F3dl3QWXjRWGFkfZzvBPClM_FSLCEInVTDF0wtMkk5sDfbmWH1b2RMuqk',
  process.env.VAPID_PRIVATE_KEY || 'Fi8qX-4M-3qo3IfOUT174OPWrcX6uoa0YFilm82IJTs'
);

const morningQuotes = [
  "Good morning. Today is another chance to invest in yourself — one steady, intentional choice at a time. Let's make it count. ☀️",
  "Rise and shine. Progress is built on consistency, not perfection. Show up for yourself today and the results will follow. 💪",
  "Good morning. Your body is capable of remarkable things when you treat it with care. Start today strong and hydrated. 🌿",
  "A fresh morning, a fresh start. Small disciplined actions today become the strength you'll be proud of tomorrow. 🌅",
  "Good morning. Fuel your body well, move with purpose, and be kind to yourself. You've got everything it takes. 🙌"
];

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

  try {
    // 1. Fetch all active push subscriptions
    const { data: subscribers, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('*');

    if (subsError) {
      if (subsError.message.includes('does not exist')) {
        return res.status(200).json({ message: 'No subscriptions found because push_subscriptions table does not exist.' });
      }
      throw subsError;
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
        const { data: userProfile } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single();

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
          const { data: logToday } = await supabase
            .from('tracker_logs')
            .select('*')
            .eq('user_id', userProfile.id)
            .eq('log_date', dateStr)
            .single();

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
          const { data: clientRow } = await supabase
            .from('clients')
            .select('coach_id')
            .eq('user_id', userProfile.id)
            .maybeSingle();
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
