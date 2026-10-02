// "Finish setting up" reminders to clients who started signing up but quit
// the onboarding wizard midway. Fitengineers is built to guide people on its
// own (self-guided), so the app itself nudges them back rather than leaving
// it to the super-admin to chase them.
//
// Schedule (decided 2026-10-02): at most 3 reminders per person —
//   #1 at the first send-nudges cron slot ≥ 1h after they signed up,
//   #2 and #3 at the 11:00 IST slot on the next two days (≥ 12h apart, so
//   a reminder sent at 8:00 waits for tomorrow, not 11:00 the same day),
// then stop. Also stops the moment onboarding_completed flips true.
//
// Email is the main channel: the app asks for push permission only after
// sign-up, so almost nobody who quit midway has a push subscription (1 of 9
// when this was written). Push goes too when they do have one.
//
// Every reminder that got out by email or push writes one push_log row with
// event 'finish_signup_reminder' — that's the counter for the 3-cap. A
// reminder nothing could deliver (no Resend/VAPID keys, provider down) isn't
// counted, so they still get their 3 once sending works.
// Underscore-prefixed so Vercel doesn't deploy it as its own function.
import webPush from 'web-push';
import { vapidReady } from './_adminAlert.js';

export const REMINDER_EVENT = 'finish_signup_reminder';
export const MAX_REMINDERS = 3;
const HOUR = 60 * 60 * 1000;
// Don't start reminding people who abandoned sign-up long ago (e.g. on the
// first run after deploy) — only recent sign-ups get the first reminder.
const FIRST_REMINDER_MAX_AGE = 3 * 24 * HOUR;
const FOLLOW_UP_IST_HOUR = 11;
const FOLLOW_UP_MIN_GAP = 12 * HOUR;
const APP_ORIGIN = 'https://fitengineerss-app.vercel.app';

export function istHourOf(now) {
  const d = new Date(now);
  return Math.floor((d.getUTCHours() + d.getUTCMinutes() / 60 + 5.5) % 24);
}

// Whether this client is due a reminder right now. sentTimes: ms timestamps
// of reminders already sent to them.
export function reminderDue({ createdAt, sentTimes = [], now = Date.now() }) {
  if (!createdAt) return false;
  const age = now - new Date(createdAt).getTime();
  if (age < HOUR) return false;
  if (sentTimes.length >= MAX_REMINDERS) return false;
  if (sentTimes.length === 0) return age <= FIRST_REMINDER_MAX_AGE;
  const last = Math.max(...sentTimes);
  return istHourOf(now) === FOLLOW_UP_IST_HOUR && now - last >= FOLLOW_UP_MIN_GAP;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Wording per reminder number — gentle, no guilt, and the last one says it's
// the last so it never feels endless.
export function reminderCopy(name, n) {
  const hi = name ? `Hi ${name}` : 'Hi there';
  if (n === 1) {
    return {
      subject: 'You’re one step away from your Fitengineers plan',
      pushTitle: 'Your plan is almost ready 💪',
      pushBody: 'Finish setting up in 2 minutes — Fitengineers will guide you from there.',
      heading: 'Your plan is almost ready',
      lines: [`${hi},`, 'You started setting up Fitengineers but didn’t quite finish. It only takes about 2 minutes — answer a few questions and the app builds your plan and guides you through every workout.']
    };
  }
  if (n === 2) {
    return {
      subject: 'Your Fitengineers plan is waiting for you',
      pushTitle: 'Still there? Your plan is waiting 🙌',
      pushBody: 'Pick up where you left off — just a few questions to go.',
      heading: 'Pick up where you left off',
      lines: [`${hi},`, 'Your Fitengineers account is ready — just a few questions left before you get your personalised plan. No coach needed: the app guides you step by step.']
    };
  }
  return {
    subject: 'Last reminder: finish setting up Fitengineers',
    pushTitle: 'One last nudge 👋',
    pushBody: 'Finish setting up whenever you’re ready — we won’t remind you again.',
    heading: 'One last nudge',
    lines: [`${hi},`, 'This is our last reminder — we won’t email you about this again. Whenever you’re ready, finish setting up and Fitengineers will take it from there.']
  };
}

async function sendReminderEmail({ email, copy }) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey || !email) return false;
  const senderEmail = process.env.SENDER_EMAIL || 'noreply@fitengineerss.com';
  const senderName = process.env.SENDER_NAME || 'Fitengineers';
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [email],
        subject: copy.subject,
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
            <h2 style="color: #6d28d9; margin-top: 0;">${escapeHtml(copy.heading)}</h2>
            ${copy.lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}
            <p style="margin: 24px 0;">
              <a href="${APP_ORIGIN}/" style="background-color: #6d28d9; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Finish setting up</a>
            </p>
            <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">You’re receiving this because you started creating a Fitengineers account with this email. We send at most 3 reminders.</p>
          </div>
        `
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('finish-signup reminder: Resend send failed:', resp.status, data.message || data.name);
      return false;
    }
    return { emailId: data.id || null };
  } catch (err) {
    console.error('finish-signup reminder email error:', err);
    return false;
  }
}

export async function runFinishSignupReminders({ supabaseUrl, serviceKey, clients, users, now = Date.now() }) {
  if (!supabaseUrl || !serviceKey) return { due: 0, sent: 0 };
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const rest = (path, init = {}) => fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });

  const unfinished = (clients || []).filter(c => c.onboarding_completed !== true && c.user_id && c.created_at);
  if (unfinished.length === 0) return { due: 0, sent: 0 };

  // Reminders already sent, per client — one query for everyone.
  const ids = unfinished.map(c => c.user_id);
  const logRows = await rest(
    `push_log?event=eq.${REMINDER_EVENT}&target_user_id=in.(${ids.map(encodeURIComponent).join(',')})&select=target_user_id,created_at`
  ).then(r => (r.ok ? r.json() : null)).catch(() => null);
  // Can't tell who was already reminded — skip this run rather than risk
  // re-sending to everyone.
  if (!Array.isArray(logRows)) return { due: 0, sent: 0, error: 'log_read_failed' };
  const sentBy = {};
  for (const r of logRows) (sentBy[r.target_user_id] ||= []).push(new Date(r.created_at).getTime());

  const due = unfinished.filter(c => reminderDue({ createdAt: c.created_at, sentTimes: sentBy[c.user_id] || [], now }));
  const canPush = due.length > 0 && vapidReady();
  let sent = 0;

  for (const c of due) {
    const user = (users || []).find(u => u.id === c.user_id);
    const email = user?.email || null;
    if (!email) continue;
    const name = (c.full_name || user?.full_name || '').trim().split(/\s+/)[0] || null;
    const n = (sentBy[c.user_id] || []).length + 1;
    const copy = reminderCopy(name, n);

    const emailResult = await sendReminderEmail({ email, copy });
    let pushSent = 0, pushFailed = 0;
    if (canPush) {
      const subs = await rest(`push_subscriptions?user_id=eq.${encodeURIComponent(c.user_id)}&select=id,subscription`).then(r => r.json()).catch(() => []);
      const payload = JSON.stringify({ title: copy.pushTitle, body: copy.pushBody, icon: '/logo.png', vibrate: [300, 100, 300], url: '/' });
      for (const sub of Array.isArray(subs) ? subs : []) {
        try {
          await webPush.sendNotification(sub.subscription, payload);
          pushSent++;
        } catch (err) {
          pushFailed++;
          if (err.statusCode === 410 || err.statusCode === 404) {
            await rest(`push_subscriptions?id=eq.${encodeURIComponent(sub.id)}`, { method: 'DELETE' }).catch(() => {});
          }
        }
      }
    }
    // Nothing could be sent at all (e.g. preview deploy: no Resend/VAPID
    // keys) — don't burn one of their 3 reminders on it.
    if (!emailResult && pushSent === 0) continue;

    await rest('push_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ event: REMINDER_EVENT, target_user_id: c.user_id, title: copy.pushTitle, body: `Reminder ${n}/${MAX_REMINDERS}${emailResult ? ' · emailed' : ''}`, sent_count: pushSent, failed_count: pushFailed })
    }).catch(() => {});
    if (emailResult) {
      await rest('email_events', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ event_type: `${REMINDER_EVENT}.sent`, email_id: emailResult.emailId, recipient: email, subject: copy.subject })
      }).catch(() => {});
    }
    sent++;
  }
  return { due: due.length, sent };
}
