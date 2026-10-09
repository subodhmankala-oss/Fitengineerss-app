// Helpers for the admin "WhatsApp these clients" panel (AdminWhatsappNudge).

export const FOUNDER_COACH_EMAIL = 'subodhmankala@gmail.com';
export const APP_LINK = 'https://fitengineerss-app.vercel.app';

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
