// Helpers for the admin "WhatsApp these clients" panel (AdminWhatsappNudge)
// and the coach home's "gone quiet" card (CoachQuietClients).

export const FOUNDER_COACH_EMAIL = 'subodhmankala@gmail.com';
export const APP_LINK = 'https://fitengineerss-app.vercel.app';

// Ready-made messages per admin Clients tile. "Never logged in" people have never seen the
// app, so they get a welcome / help-getting-in message, not "come back".
export const NUDGE_PRESETS = {
  'inactive-long': [
    {
      label: 'Easy restart',
      text: 'Hi {name}! 👋 It\'s the Fitengineers team. Life gets busy — totally normal. Your plan is saved right where you left off. Just one short workout this week is enough to get going again 💪'
    },
    {
      label: 'Ask what\'s wrong',
      text: 'Hi {name}, quick check-in from the Fitengineers team. Is the plan working for you? If the workouts feel too hard, too long or don\'t fit your schedule, just reply here and we\'ll adjust it.'
    },
    {
      label: 'Short & simple',
      text: 'Hi {name}! Haven\'t seen you in the app for a few days 🙂 Even 20 minutes today keeps your progress going. Tap below to open your workout.'
    }
  ],
  never: [
    {
      label: 'Welcome',
      text: 'Hi {name}! 👋 Welcome to Fitengineers. Your account is ready — tap the link below and log in with the email you signed up with. Your first workout takes just a few minutes to start.'
    },
    {
      label: 'Trouble logging in?',
      text: 'Hi {name}, it\'s the Fitengineers team. We noticed you haven\'t logged in yet — any trouble getting in? If you\'ve forgotten your password, tap "Forgot password" on the login screen, or just reply here and we\'ll help.'
    },
    {
      label: 'Short & simple',
      text: 'Hi {name}! Your Fitengineers account is all set up 🎉 It takes 2 minutes to get started — tap below to log in.'
    }
  ]
};

// Same India-first rule as TrainerDashboard's toWhatsappNumber: a bare
// 10-digit number gets 91 prefixed, anything longer is trusted as-is.
export const toWhatsappNumber = (phone) => {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `91${digits}` : digits;
};

// Clients the founder messages as the team: no coach, or the founder's own
// coach account. A coach_id that doesn't match any known coach is treated as
// someone else's client, not as Self-Guided.
export const isFounderAudience = (client, coachesList = []) => {
  if (!client.coach_id) return true;
  const coach = coachesList.find(co => co.id === client.coach_id);
  return (coach?.email || '').trim().toLowerCase() === FOUNDER_COACH_EMAIL;
};

// {name} becomes the client's first name; the app link always goes last so
// they can open the app straight from the chat.
export const buildNudgeMessage = (template, client) => {
  const firstName = (client.userName || '').trim().split(/\s+/)[0] || 'there';
  const body = (template || '').replace(/\{name\}/gi, firstName).trim();
  return `${body}\n\n${APP_LINK}`;
};

// Opens WhatsApp with the number + text filled in: the app on phones, WhatsApp
// Web on desktop (whatsapp:// has nothing listening on desktop).
export const openWhatsapp = (phone, text) => {
  const qs = new URLSearchParams({ phone, text });
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  if (isMobile) window.location.href = `whatsapp://send?${qs.toString()}`;
  else window.open(`https://web.whatsapp.com/send?${qs.toString()}`, '_blank', 'noopener,noreferrer');
};
