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

// ─── Leads, check-ins, trainer payday ───
export const LEAD_STAGES = [
  { key: 'new', label: 'New enquiry', tone: 'blue' },
  { key: 'trial_booked', label: 'Trial booked', tone: 'amber' },
  { key: 'trial_done', label: 'Trial done', tone: 'yellow' },
  { key: 'joined', label: 'Joined', tone: 'green' }
];
export const LEAD_SOURCES = [
  { key: 'instagram', label: 'Instagram' }, { key: 'walk-in', label: 'Walk-in' },
  { key: 'referral', label: 'Referral' }, { key: 'google', label: 'Google' }, { key: 'other', label: 'Other' }
];

const IST_MS = 5.5 * 3600000;
// The India-time calendar date (YYYY-MM-DD) of an ISO timestamp.
export const istDate = (iso) => new Date(Date.parse(iso) + IST_MS).toISOString().slice(0, 10);
export const istTime = (iso) => new Date(Date.parse(iso) + IST_MS).toISOString().slice(11, 16);

// Leads that joined this month (YYYY-MM of `today`) against the goal.
export function leadStats(leads, goal, today) {
  const month = today.slice(0, 7);
  const joined = (leads || []).filter((l) => l.stage === 'joined' && l.joined_at && istDate(l.joined_at).slice(0, 7) === month).length;
  const day = new Date(`${today}T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
  return { joined, goal, toGo: Math.max(0, goal - joined), daysLeft: daysInMonth - day.getUTCDate() };
}

// Who is inside now: checked in, not out, and in within the last 6 hours.
export function insideNow(checkins, nowMs = Date.now()) {
  return (checkins || []).filter((c) => !c.out_at && nowMs - Date.parse(c.in_at) < 6 * 3600000);
}

export const checkinsToday = (checkins, today) => (checkins || []).filter((c) => istDate(c.in_at) === today).length;

// Everyone in the gym right now, one row per member, with how we know:
// 'coach' (trainer's Live Log open for them), 'self' (logging their own
// sets), 'done' (saved a workout in the last 15 min) — all automatic, from
// biz.activity — or 'desk' (a manual check-in, for members without the app).
export function whoIsIn(biz, nowMs = Date.now()) {
  const out = new Map();
  for (const t of biz?.activity?.training || []) {
    const prev = out.get(t.member_id);
    if (!prev || t.source === 'coach') out.set(t.member_id, { memberId: t.member_id, how: t.source, since: t.since, auto: true });
  }
  for (const f of biz?.activity?.justFinished || []) {
    if (!out.has(f.member_id)) out.set(f.member_id, { memberId: f.member_id, how: 'done', since: f.at, auto: true });
  }
  for (const c of insideNow(biz?.checkins, nowMs)) {
    if (!out.has(c.member_id)) out.set(c.member_id, { memberId: c.member_id, how: 'desk', since: c.in_at, auto: false });
  }
  return [...out.values()].sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
}

// Members who came in today: trained (any workout saved or open today) or
// were checked in at the desk. Each person counts once.
export function visitsToday(biz, today) {
  const ids = new Set(biz?.activity?.trainedToday || []);
  (biz?.activity?.training || []).forEach((t) => ids.add(t.member_id));
  (biz?.checkins || []).filter((c) => istDate(c.in_at) === today).forEach((c) => ids.add(c.member_id));
  return ids.size;
}

// "Getting busy" from 70% of capacity.
export const busyLabel = (inside, capacity) => (inside >= capacity ? 'Full' : inside >= capacity * 0.7 ? 'Getting busy' : 'Plenty of room');

// Each trainer's personal-training fees for a month (YYYY-MM) and their share.
// Fees = payments received that month against PT plans, for members the
// trainer coaches now.
export function payday(biz, clients, trainers, month, sharePct) {
  const pt = new Set((biz?.memberships || []).filter((m) => m.is_pt).map((m) => m.id));
  const coachOf = Object.fromEntries(clients.map((c) => [c.id, c.coachId]));
  const fees = {};
  (biz?.payments || []).forEach((p) => {
    if (!pt.has(p.membership_id) || String(p.paid_on).slice(0, 7) !== month) return;
    const coach = coachOf[p.member_id];
    if (coach) fees[coach] = (fees[coach] || 0) + p.amount_inr;
  });
  const paidRows = {};
  (biz?.payouts || []).forEach((r) => { if (String(r.month).slice(0, 7) === month) paidRows[r.trainer_id] = r; });
  return trainers.map((t) => {
    const f = fees[t.id] || 0;
    const payout = Math.round((f * sharePct) / 100);
    return { trainerId: t.id, name: t.name, fees: f, payout, paid: !!paidRows[t.id], paidAmount: paidRows[t.id]?.amount_inr ?? null };
  });
}

// ─── Trainer days in + high-fives (this month) ───
// today: 'in' | 'off' | null. daysIn counts this month's days marked in.
export function trainerDays(biz, trainerId, today) {
  const mine = (biz?.trainerDays || []).filter((d) => d.trainer_id === trainerId);
  const row = mine.find((d) => String(d.day).slice(0, 10) === today);
  return {
    today: row?.status || null,
    daysIn: mine.filter((d) => d.status === 'in').length,
    daysOff: mine.filter((d) => d.status === 'off').length,
    highFives: (biz?.highFives || []).filter((h) => h.trainer_id === trainerId).length
  };
}

// Live calorie board. period 'today' or 'week'. Members who burned something
// rank by calories (ties: whoever got there first), then everyone else by name.
export function liveBoard(live, period, sex = 'all') {
  if (!live) return [];
  const by = {};
  for (const s of live.sessions || []) {
    if (period === 'today' && s.date !== live.today) continue;
    const b = by[s.memberId] || (by[s.memberId] = { kcal: 0, sessions: 0, lastAt: '' });
    b.kcal += Number(s.kcal) || 0;
    b.sessions += 1;
    if (s.at > b.lastAt) b.lastAt = s.at;
  }
  return (live.members || [])
    .filter((m) => sex === 'all' || m.sex === sex)
    .map((m) => ({ id: m.id, name: m.name || 'Member', email: m.email || null, avatarUrl: m.avatarUrl || null, kcal: Math.round(by[m.id]?.kcal || 0), sessions: by[m.id]?.sessions || 0, lastAt: by[m.id]?.lastAt || '' }))
    .sort((a, b) => (b.kcal - a.kcal) || (a.kcal && b.kcal ? a.lastAt.localeCompare(b.lastAt) : 0) || (b.sessions - a.sessions) || a.name.localeCompare(b.name));
}

// Member counts for the Live board's All / Male / Female tabs, plus how many
// have not said (they only appear under All).
export function liveSexCounts(live) {
  const members = live?.members || [];
  const male = members.filter((m) => m.sex === 'male').length;
  const female = members.filter((m) => m.sex === 'female').length;
  return { all: members.length, male, female, unset: members.length - male - female };
}
