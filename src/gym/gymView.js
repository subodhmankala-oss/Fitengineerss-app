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
