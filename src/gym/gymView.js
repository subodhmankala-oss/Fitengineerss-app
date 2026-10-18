// Pure helpers for the gym owner's own site (/gym). Kept apart from the
// components so those export only components (react-refresh lint).

const DAY_MS = 86400000;
const dayNum = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / DAY_MS);

// One true/false per day, oldest first, ending today: did the member train?
export function visitGrid(sessionDates, today, days = 14) {
  const trained = new Set((sessionDates || []).map((d) => dayNum(d)));
  const end = dayNum(today);
  return Array.from({ length: days }, (_, i) => trained.has(end - (days - 1 - i)));
}

// Consecutive days trained, counting back from today — or from yesterday when
// they haven't trained yet today, so a streak doesn't read 0 every morning.
export function dayStreak(sessionDates, today) {
  const trained = new Set((sessionDates || []).map((d) => dayNum(d)));
  let day = dayNum(today);
  if (!trained.has(day)) day -= 1;
  let n = 0;
  while (trained.has(day)) { n += 1; day -= 1; }
  return n;
}

// The tag + one-tap action shown on a member row, from their training health.
// Ends soon / Payment due arrive with the Payments screen.
export const MEMBER_TAGS = {
  thriving: { label: 'Active', tone: 'green', action: 'High-five' },
  steady: { label: 'Active', tone: 'green', action: 'High-five' },
  slipping: { label: 'Slipping', tone: 'amber', action: 'Message' },
  quiet: { label: 'Stopped coming', tone: 'red', action: 'Message' },
  inactive: { label: 'Not started', tone: 'red', action: 'Message' },
  new: { label: 'New', tone: 'blue', action: 'Welcome' }
};

export function memberTag(client) {
  return MEMBER_TAGS[client.engagement?.status] || MEMBER_TAGS.steady;
}

export const MEMBER_FILTERS = [
  { key: 'all', label: 'Everyone', dot: '#1b2646', test: () => true },
  { key: 'stopped', label: 'Stopped coming', dot: '#f05b6b', test: (c) => ['quiet', 'inactive'].includes(c.engagement?.status) },
  { key: 'slipping', label: 'Slipping', dot: '#ffb02e', test: (c) => c.engagement?.status === 'slipping' },
  { key: 'new', label: 'New', dot: '#4a66c4', test: (c) => c.engagement?.status === 'new' },
  { key: 'active', label: 'Active', dot: '#2fbf8a', test: (c) => ['thriving', 'steady'].includes(c.engagement?.status) },
  { key: 'waiting', label: 'Waiting for a trainer', dot: '#94a3b8', test: (c) => !c.trainerName && !c.selfGuided }
];

// Filters that depend on each member's plan (need the memberPlans map).
export const PLAN_FILTERS = [
  { key: 'ends', label: 'Ends soon', dot: '#ffb02e', test: (c, plans) => ['ends-soon', 'expired'].includes(plans[c.id]?.state) },
  { key: 'due', label: 'Payment due', dot: '#f08a2e', test: (c, plans) => plans[c.id]?.state === 'due' }
];

export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export const initials = (name) => {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

// Trainers ranked by the share of their members still training, then by how
// many members they have.
export function rankTrainers(trainers) {
  return [...trainers]
    .filter((t) => t.clientCount > 0)
    .sort((a, b) => ((b.stats.activePct ?? -1) - (a.stats.activePct ?? -1)) || (b.clientCount - a.clientCount));
}

// ─── Money: plans, memberships, payments ───
const dayNumber = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / 86400000);
export const ENDS_SOON_DAYS = 7;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Each member's CURRENT membership (the one that ends last) with what has been
// paid against it. state: due (still owes money) > expired > ends-soon > active.
export function memberPlans(biz, today) {
  const paid = {};
  (biz?.paidByMembership || []).forEach((p) => { paid[p.membership_id] = (paid[p.membership_id] || 0) + p.amount_inr; });
  const out = {};
  (biz?.memberships || []).forEach((m) => {
    const prev = out[m.member_id];
    if (prev && prev.endsOn >= m.ends_on) return;
    const daysLeft = dayNumber(m.ends_on) - dayNumber(today);
    const due = Math.max(0, m.price_inr - (paid[m.id] || 0));
    const state = due > 0 ? 'due' : daysLeft < 0 ? 'expired' : daysLeft <= ENDS_SOON_DAYS ? 'ends-soon' : 'active';
    out[m.member_id] = { membershipId: m.id, planName: m.plan_name, endsOn: m.ends_on, daysLeft, price: m.price_inr, paid: paid[m.id] || 0, due, state };
  });
  return out;
}

// Money in by calendar month: the last `count` months ending with today's,
// oldest first, plus this month's total. Month keys are YYYY-MM.
export function monthlyCollections(payments, today, count = 6) {
  const [y, m] = today.split('-').map(Number);
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: MONTH_SHORT[d.getUTCMonth()], total: 0 });
  }
  (payments || []).forEach((p) => {
    const slot = months.find((x) => x.key === String(p.paid_on).slice(0, 7));
    if (slot) slot.total += p.amount_inr;
  });
  return { months, thisMonth: months[months.length - 1].total };
}

export const GYM_COLOURS = {
  blue: '#4a66c4', teal: '#1f8a9a', green: '#2e8b57', orange: '#d2551a', pink: '#b3236b'
};

// The tag a member row shows: money state wins over training health.
export function memberRowTag(client, plan) {
  if (plan?.state === 'due') return { label: 'Payment due', tone: 'amber', action: 'Collect' };
  if (plan?.state === 'expired') return { label: 'Plan ended', tone: 'red', action: 'Renew' };
  if (plan?.state === 'ends-soon') return { label: 'Ends soon', tone: 'amber', action: 'Remind' };
  return memberTag(client);
}
