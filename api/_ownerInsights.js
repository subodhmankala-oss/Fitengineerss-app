// Gym-owner analytics, built from the training data only this app has
// (workout_logs): member health, the weekly trend, when members train, a
// per-trainer scorecard, and a single member's profile. Pure functions —
// api/data-read.js does the (verified, gym-scoped) reads and hands the rows
// here. Underscore-prefixed so Vercel doesn't count it as its own function
// (the project is at the Hobby 12-function cap).
//
// Everything is ACTIVITY. Private coach notes, progress photos and body
// measurements are never read for owners (gyms.owner_sees_private is off by
// default — 2026-10-14 decision).

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

export const TREND_WEEKS = 8;
export const MEMBER_WEEKS = 12;
// A member who last trained this many days ago is "gone quiet".
export const QUIET_DAYS = 14;

// Today's date in India (the app's users): log_date is the member's local
// date, so "days ago" must be counted from the local date too, not UTC.
export function istToday(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function daysAgoOf(dateStr, today) {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${String(dateStr).slice(0, 10)}T00:00:00Z`)) / DAY_MS);
}

// "Slipping" / "gone quiet" etc. from how often a member trained in the last
// 2 weeks versus the 4 weeks before that. Plain rules, explainable to an owner.
export function engagementOf({ recent14, prior28, lastDaysAgo, joinedDaysAgo }) {
  if (lastDaysAgo === null) return joinedDaysAgo !== null && joinedDaysAgo < QUIET_DAYS ? 'new' : 'inactive';
  if (lastDaysAgo >= QUIET_DAYS) return 'quiet';
  const priorWeekly = prior28 / 4;
  const recentWeekly = recent14 / 2;
  if (priorWeekly >= 1 && recentWeekly < priorWeekly * 0.5) return 'slipping';
  if (recentWeekly >= 2 && recentWeekly >= priorWeekly) return 'thriving';
  return 'steady';
}

export const AT_RISK = ['slipping', 'quiet', 'inactive'];

function weekIndex(daysAgo, weeks) {
  const w = Math.floor(daysAgo / 7);
  return w >= 0 && w < weeks ? weeks - 1 - w : -1; // oldest -> newest
}

const round1 = (n) => Math.round(n * 10) / 10;

export function buildOwnerGymPayload(gym, members, logs, now = new Date()) {
  const today = istToday(now);

  // Distinct workout DAYS per user (many set rows per session), plus the
  // earliest save time of each user-day (≈ when they trained).
  const days = {};
  const firstSeen = {};
  for (const l of logs) {
    const d = String(l.log_date).slice(0, 10);
    (days[l.user_id] || (days[l.user_id] = new Set())).add(d);
    if (l.created_at) {
      const t = Date.parse(l.created_at);
      const key = `${l.user_id}|${d}`;
      if (Number.isFinite(t) && (firstSeen[key] === undefined || t < firstSeen[key])) firstSeen[key] = t;
    }
  }

  const activity = (c) => {
    const list = [...(days[c.id] || [])].sort();
    const ago = list.map((d) => daysAgoOf(d, today));
    const weeks = new Array(TREND_WEEKS).fill(0);
    ago.forEach((a) => { const i = weekIndex(a, TREND_WEEKS); if (i >= 0) weeks[i] += 1; });
    const recent14 = ago.filter((a) => a < 14).length;
    const prior28 = ago.filter((a) => a >= 14 && a < 42).length;
    const lastDaysAgo = ago.length ? Math.min(...ago) : null;
    const joinedDaysAgo = c.created_at ? daysAgoOf(String(c.created_at).slice(0, 10), today) : null;
    return {
      lastWorkout: list.length ? list[list.length - 1] : null,
      workouts7d: ago.filter((a) => a < 7).length,
      workouts28d: ago.filter((a) => a < 28).length,
      workouts30d: ago.filter((a) => a < 30).length,
      // The actual days (newest first) — so the owner sees WHO trained and WHEN.
      recentDays: list.filter((_, i) => ago[i] < 7).reverse(),
      weeks,
      engagement: {
        status: engagementOf({ recent14, prior28, lastDaysAgo, joinedDaysAgo }),
        recent14,
        prior28
      }
    };
  };

  const trainersRaw = members.filter((m) => m.role === 'coach' || m.role === 'super-admin');
  const clientsRaw = members.filter((m) => m.role === 'client');
  const trainerName = Object.fromEntries(trainersRaw.map((t) => [t.id, t.full_name || t.email]));

  const clients = clientsRaw.map((c) => ({
    id: c.id,
    name: c.full_name || (c.email || '').split('@')[0],
    email: c.email,
    // For the owner's "message them" nudge on members who've gone quiet.
    phone: c.phone || null,
    avatarUrl: c.avatar_url || null,
    coachId: c.coach_id || null,
    // A coach_id outside this gym (shouldn't happen) reads as unassigned so
    // the owner can fix it rather than see a trainer they can't manage.
    trainerName: trainerName[c.coach_id] || null,
    // No trainer and doesn't want one (sql/gym_self_guided.sql) — not on
    // the waiting list.
    selfGuided: !trainerName[c.coach_id] && !!c.gym_self_guided,
    joinedAt: c.created_at || null,
    lastLogin: c.last_login || null,
    ...activity(c)
  }));

  const trainers = trainersRaw.map((t) => {
    const mine = clients.filter((c) => c.coachId === t.id);
    const weekly = new Array(TREND_WEEKS).fill(0);
    mine.forEach((c) => c.weeks.forEach((n, i) => { weekly[i] += n; }));
    const active14 = mine.filter((c) => c.engagement.recent14 > 0).length;
    return {
      id: t.id,
      name: t.full_name || (t.email || '').split('@')[0],
      email: t.email,
      avatarUrl: t.avatar_url || null,
      isOwner: t.id === gym.owner_id,
      lastLogin: t.last_login || null,
      clientCount: mine.length,
      activeClients7d: mine.filter((c) => c.workouts7d > 0).length,
      // Scorecard: how many of their clients are still training, how often,
      // and how many are slipping — comparable across trainers.
      stats: {
        active14,
        activePct: mine.length ? Math.round((100 * active14) / mine.length) : null,
        perClientWeek: mine.length ? round1(mine.reduce((s, c) => s + c.workouts28d, 0) / mine.length / 4) : null,
        atRisk: mine.filter((c) => AT_RISK.includes(c.engagement.status)).length,
        workouts7d: mine.reduce((s, c) => s + c.workouts7d, 0),
        weekly
      }
    };
  });

  // Gym trend: workouts and distinct active members per 7-day block.
  const weekly = new Array(TREND_WEEKS).fill(null).map((_, i) => ({
    workouts: clients.reduce((s, c) => s + c.weeks[i], 0),
    members: clients.filter((c) => c.weeks[i] > 0).length
  }));

  // When members train: Monday-first 7 x 24 grid in IST, one count per
  // member-day (at the first time that day's workout was saved), last 8 weeks.
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let peakTotal = 0;
  Object.entries(firstSeen).forEach(([key, t]) => {
    const date = key.slice(key.indexOf('|') + 1);
    if (daysAgoOf(date, today) >= TREND_WEEKS * 7) return;
    const local = new Date(t + IST_OFFSET_MS);
    grid[(local.getUTCDay() + 6) % 7][local.getUTCHours()] += 1;
    peakTotal += 1;
  });

  const health = { thriving: 0, steady: 0, slipping: 0, quiet: 0, inactive: 0, new: 0 };
  clients.forEach((c) => { health[c.engagement.status] += 1; });

  return {
    gym: { id: gym.id, name: gym.name, joinCode: gym.join_code, status: gym.status, createdAt: gym.created_at },
    trainers,
    clients,
    // today: the India-time date the weekly bars count back from, so every
    // device labels the same weeks.
    insights: { today, weekly, peak: { grid, total: peakTotal }, health }
  };
}

const SOURCE_LABEL = {
  backfill: 'With them since before the gym tracked it',
  invite_code: 'Joined with their invite code',
  gym_code: 'Joined through the gym',
  owner_assign: 'Assigned by the gym owner',
  admin_assign: 'Assigned by Fitengineers'
};

// One member's profile for the gym owner. Training activity + coaching
// history only.
export function buildMemberPayload({ user, client, logs, history, names, ownerId }, now = new Date()) {
  const today = istToday(now);

  const bySession = new Map();
  const days = new Set();
  for (const l of logs) {
    const d = String(l.log_date).slice(0, 10);
    days.add(d);
    const key = l.session_id ? `s:${l.session_id}` : `d:${d}|${l.plan_name || ''}`;
    let s = bySession.get(key);
    if (!s) { s = { date: d, plan: l.plan_name || null, exercises: new Set(), sets: 0, volumeKg: 0 }; bySession.set(key, s); }
    if (l.exercise_name) s.exercises.add(l.exercise_name);
    s.sets += 1;
    const reps = Number(l.reps);
    const kg = Number(l.weight_kg);
    if (reps > 0 && kg > 0) s.volumeKg += reps * kg;
  }
  const sessions = [...bySession.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
    .map((s) => ({ date: s.date, plan: s.plan, exercises: s.exercises.size, sets: s.sets, volumeKg: Math.round(s.volumeKg) }));

  const list = [...days].sort();
  const ago = list.map((d) => daysAgoOf(d, today));
  const weeks = new Array(MEMBER_WEEKS).fill(0);
  ago.forEach((a) => { const i = weekIndex(a, MEMBER_WEEKS); if (i >= 0) weeks[i] += 1; });

  const coachName = (id) => (id === ownerId ? 'You' : (names[id] || 'A trainer'));
  return {
    member: {
      id: user.id,
      name: user.full_name || (user.email || '').split('@')[0],
      email: user.email,
      phone: user.phone || null,
      joinedAt: user.created_at || null,
      lastLogin: user.last_login || null,
      goal: client?.fitness_goal || null,
      program: client?.program || null,
      programStartedOn: client?.program_started_on || null,
      totalSessions: client?.total_sessions ?? null,
      trainerId: user.coach_id || null,
      trainerName: user.coach_id ? coachName(user.coach_id) : null,
      selfGuided: !user.coach_id && !!user.gym_self_guided
    },
    stats: {
      workouts30d: ago.filter((a) => a < 30).length,
      workouts90d: list.length,
      perWeek: round1(list.length / (90 / 7)),
      lastWorkout: list.length ? list[list.length - 1] : null,
      weeks
    },
    sessions,
    history: (history || []).map((h) => ({
      trainerName: h.coach_id ? coachName(h.coach_id) : 'No trainer',
      startedAt: h.started_at,
      endedAt: h.ended_at || null,
      how: SOURCE_LABEL[h.source] || 'Assigned'
    }))
  };
}
