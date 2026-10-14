// ─── WORKOUT STREAK ENGINE ───
// Pure calculation over raw workout_logs rows (the array the home dashboard
// already holds) — no schema, no network. A "workout day" is any local
// log_date with at least one logged row.
//
// Lifters need rest days, so a plain "every calendar day" streak would punish
// good training. A streak instead survives up to MAX_REST_DAYS rest days in a
// row: two workout days link when they're at most MAX_REST_DAYS + 1 days
// apart, and the streak is still alive until that allowance runs out.

import { getLocalDateString, parseLocalDateString, shiftLocalDateString } from './dateUtils.js';

export const MAX_REST_DAYS = 2;

const MS_PER_DAY = 86400000;

// Whole days between two YYYY-MM-DD strings (b - a). Rounded so a DST shift
// in local midnights can't produce 0.96 / 1.04.
const dayDiff = (a, b) =>
  Math.round((parseLocalDateString(b) - parseLocalDateString(a)) / MS_PER_DAY);

/**
 * @param {Array} logs - raw workout_logs rows (log_date: YYYY-MM-DD)
 * @param {string} [today] - YYYY-MM-DD, injectable for tests
 * @returns {{
 *   current: number,        // workout days in the live chain (0 if lapsed)
 *   best: number,           // longest chain ever
 *   lastWorkoutDate: string|null,
 *   trainedToday: boolean,
 *   status: 'none'|'active'|'at_risk'|'lapsed',
 *   keepAliveBy: string|null // last day a workout still extends the chain
 * }}
 *
 * status: 'active' = trained today; 'at_risk' = chain alive but today is
 * still empty; 'lapsed' = rest allowance exceeded (current is 0).
 */
export function computeWorkoutStreak(logs, today = getLocalDateString()) {
  const days = [...new Set(
    (logs || [])
      .map(r => r && r.log_date)
      .filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today)
  )].sort();

  if (days.length === 0) {
    return { current: 0, best: 0, lastWorkoutDate: null, trainedToday: false, status: 'none', keepAliveBy: null };
  }

  let best = 0;
  let run = 0;
  let prev = null;
  days.forEach(d => {
    run = prev && dayDiff(prev, d) <= MAX_REST_DAYS + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  });

  const lastWorkoutDate = days[days.length - 1];
  const sinceLast = dayDiff(lastWorkoutDate, today);
  const alive = sinceLast <= MAX_REST_DAYS + 1;
  const trainedToday = lastWorkoutDate === today;
  const keepAliveBy = alive ? shiftLocalDateString(lastWorkoutDate, MAX_REST_DAYS + 1) : null;

  return {
    current: alive ? run : 0,
    best,
    lastWorkoutDate,
    trainedToday,
    status: trainedToday ? 'active' : alive ? 'at_risk' : 'lapsed',
    keepAliveBy,
  };
}

// Streak lengths worth celebrating, in order.
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];

/** Next milestone above `current` and how far along the way there it is. */
export function nextStreakMilestone(current) {
  const target = STREAK_MILESTONES.find(m => m > current);
  if (!target) return null;
  const prev = [...STREAK_MILESTONES].reverse().find(m => m <= current) || 0;
  return { target, remaining: target - current, progress: (current - prev) / (target - prev) };
}

// Playful title per streak length. Lapsed (0) has its own.
export function streakTier(current) {
  if (current <= 0) return { title: 'Flame’s out', emoji: '🪵' };
  if (current === 1) return { title: 'Spark lit!', emoji: '✨' };
  if (current < 4) return { title: 'Warming up', emoji: '🌤️' };
  if (current < 7) return { title: 'On fire!', emoji: '🔥' };
  if (current < 14) return { title: 'Unstoppable', emoji: '⚡' };
  if (current < 30) return { title: 'Beast mode', emoji: '🦍' };
  return { title: 'Legend mode', emoji: '👑' };
}

/**
 * The last `n` days ending today, oldest first, each flagged if trained.
 * @returns {Array<{date: string, trained: boolean, isToday: boolean}>}
 */
export function recentStreakDays(logs, n = 7, today = getLocalDateString()) {
  const trained = new Set((logs || []).map(r => r && r.log_date).filter(Boolean));
  return Array.from({ length: n }, (_, i) => {
    const date = shiftLocalDateString(today, i - (n - 1));
    return { date, trained: trained.has(date), isToday: date === today };
  });
}
