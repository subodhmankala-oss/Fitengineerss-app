// Client testimonials (sql/coach_testimonials.sql). A client writes one for
// their coach from Coach Details; the coach can only Show or Hide it — never
// edit the words or add their own. Shared by the browser and
// api/save-user-data.js (action=testimonials), which does every read and
// write with the service role.
export const MAX_QUOTE_LENGTH = 400;
export const MAX_RESULT_LENGTH = 80;
export const TESTIMONIAL_STATUSES = ['pending', 'shown', 'hidden'];

const clip = (value, max) => String(value ?? '').trim().slice(0, max);

// { quote, result } ready to store, or null when there's no quote — the
// quote is the testimonial, a result on its own says nothing.
export const cleanTestimonialInput = (input) => {
  const quote = clip(input?.quote, MAX_QUOTE_LENGTH);
  if (!quote) return null;
  return { quote, result: clip(input?.result, MAX_RESULT_LENGTH) };
};

// "Priya Sharma" -> "Priya S." — what other clients see. The coach sees
// the full name.
export const shortClientName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Client';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

// Whole months between when the client joined this coach and now; null
// when the join date is missing or in the future.
export const monthsTrained = (joinedAt, now = new Date()) => {
  const start = new Date(joinedAt);
  if (!joinedAt || Number.isNaN(start.getTime()) || start > now) return null;
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
};

export const trainedLabel = (months) => {
  if (months == null) return '';
  if (months < 1) return 'Training under a month';
  return `Training ${months} month${months === 1 ? '' : 's'}`;
};

// The coach's WhatsApp ask. The link opens the client's app straight on the
// testimonial form (App.jsx's ?openTestimonial=1).
export const buildTestimonialAsk = (clientFullName, appOrigin) => {
  const firstName = String(clientFullName || '').trim().split(/\s+/)[0] || 'there';
  return `Hi ${firstName}! If training together has helped you, would you write a short testimonial for me? It takes a minute: ${appOrigin}/?openTestimonial=1`;
};
