// Pure helpers for the gym owner's screens (OwnerGymDashboard, OwnerCharts,
// OwnerProfiles). Kept out of the component files so those export only
// components (react-refresh).
import { buildNudgeMessage, openWhatsapp, toWhatsappNumber } from './whatsappNudge';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "6 Oct" for a YYYY-MM-DD date string.
export function shortDate(iso) {
  const [, m, d] = String(iso).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

// Start dates ("6 Oct") of `count` consecutive 7-day blocks ending today,
// oldest first — the same blocks the server counts workouts in.
export function weekLabels(today, count) {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(end - ((count - 1 - i) * 7 + 6) * 86400000).toISOString().slice(0, 10);
    return shortDate(start);
  });
}


// "22–28 Aug" (or "29 Aug – 4 Sep" across a month end) for each of `count`
// consecutive 7-day blocks ending today, oldest first — the plain-language
// label for a bar (the axis only has room for each block's first day).
export function weekRanges(today, count) {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const to = new Date(end - (count - 1 - i) * 7 * 86400000).toISOString().slice(0, 10);
    const from = new Date(Date.parse(`${to}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
    const [, m1, d1] = from.split('-').map(Number);
    const [, m2, d2] = to.split('-').map(Number);
    return m1 === m2 ? `${d1}–${d2} ${MONTHS[m2 - 1]}` : `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]}`;
  });
}

// How many of the oldest weeks ended before the member joined — shown as
// "Before they joined" instead of a misleading run of zeros.
export function weeksBeforeJoin(today, count, joinedIso) {
  if (!joinedIso) return 0;
  const joined = Date.parse(`${String(joinedIso).slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${today}T00:00:00Z`);
  let n = 0;
  for (let i = 0; i < count; i += 1) {
    const weekEnd = end - (count - 1 - i) * 7 * 86400000;
    if (weekEnd < joined) n += 1; else break;
  }
  return n;
}

// "1 workout" / "3 workouts"
export function plural(n, word) {
  return `${n} ${n === 1 && word.endsWith('s') ? word.slice(0, -1) : word}`;
}

// Green / blue / amber / red are the reserved status colours; each always
// appears with its text label, never colour alone.
export const OWNER_STATUS = {
  thriving: { label: 'Thriving', color: '#10b981' },
  steady: { label: 'Steady', color: 'rgb(var(--accent-rgb))' },
  slipping: { label: 'Slipping', color: '#f59e0b' },
  quiet: { label: 'Gone quiet', color: '#ef4444' },
  inactive: { label: 'Hasn’t started', color: '#94a3b8' },
  new: { label: 'New', color: '#8b5cf6' }
};


export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const TIME_BLOCKS = [
  { from: 5, to: 8, label: 'Early', range: '5–8 am' },
  { from: 8, to: 11, label: 'Morning', range: '8–11 am' },
  { from: 11, to: 14, label: 'Midday', range: '11 am–2 pm' },
  { from: 14, to: 17, label: 'Afternoon', range: '2–5 pm' },
  { from: 17, to: 20, label: 'Evening', range: '5–8 pm' },
  { from: 20, to: 23, label: 'Night', range: '8–11 pm' }
];
export const RAMP = [0.06, 0.22, 0.42, 0.68, 0.92]; // one hue, light → dark

// grid: 7 (Mon-first) x 24 hourly counts → 7 x 6 time-block counts.
export function blockCounts(grid) {
  return grid.map((row) => TIME_BLOCKS.map((b) => row.slice(b.from, b.to).reduce((s, n) => s + n, 0)));
}

// "Busiest time: Evening (5–8 pm) · Busiest day: Wednesday", or null with too
// little data. The time of day and the weekday are worked out separately so a
// tie on one doesn't hide a clear answer on the other.
export function busiestSummary(grid, minTotal = 5) {
  const cells = blockCounts(grid);
  const total = cells.flat().reduce((s, n) => s + n, 0);
  if (total < minTotal) return null;
  const blockTotals = TIME_BLOCKS.map((_, b) => cells.reduce((s, row) => s + row[b], 0));
  const dayTotals = cells.map((row) => row.reduce((s, n) => s + n, 0));
  const bestBlock = blockTotals.indexOf(Math.max(...blockTotals));
  const bestDay = dayTotals.indexOf(Math.max(...dayTotals));
  return `Busiest time: ${TIME_BLOCKS[bestBlock].label} (${TIME_BLOCKS[bestBlock].range}) · Busiest day: ${DAYS[bestDay]}`;
}


export function daysSince(isoDate, now = new Date()) {
  if (!isoDate) return null;
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00`);
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t - d) / 86400000);
}

export function agoLabel(isoDate) {
  const d = daysSince(isoDate);
  if (d === null) return 'Never';
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

// One plain sentence on WHY a member has their status.
export function statusReason(c) {
  const e = c.engagement || {};
  switch (e.status) {
    case 'slipping': return `${e.prior28} workouts in the 4 weeks before, ${e.recent14} in the last 2 weeks.`;
    case 'quiet': {
      const was = e.prior28 > 0 ? ` Was training about ${Math.max(1, Math.round(e.prior28 / 4))}× a week before.` : '';
      return `Last trained ${agoLabel(c.lastWorkout).toLowerCase()}.${was}`;
    }
    case 'inactive': return 'No workouts logged yet.';
    case 'new': return 'Just joined — no workouts yet.';
    default: return `${e.recent14 || 0} workout${e.recent14 === 1 ? '' : 's'} in the last 2 weeks.`;
  }
}

export function messageMember(client, gymName) {
  openWhatsapp(
    toWhatsappNumber(client.phone),
    buildNudgeMessage(`Hi {name}, we haven’t seen you at ${gymName || 'the gym'} in a while. Everything okay? Your next workout is ready in the app.`, { userName: client.name })
  );
}

