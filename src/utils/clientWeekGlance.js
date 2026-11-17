// Coach client list "glance": for each client, which days of this week
// (Mon–Sun) they trained, and whether they need the coach (no workout for a
// while). Built from workout_logs rows (one per set) — the same rows
// CoachQuietClients fetches via getRecentWorkoutRowsForClients.
import { getLocalDateString, shiftLocalDateString, parseLocalDateString } from './dateUtils';
import { isNewSignup } from './activityStatus';

// How far back we fetch logs. Also the RECAP_DAYS window the WhatsApp
// check-in message talks about, so one fetch serves both.
export const GLANCE_LOOKBACK_DAYS = 30;

// No workout for this many days → red "needs you" line. Same line as the
// red "long inactive" activity badge (LONG_INACTIVE_DAYS).
export const NEEDS_YOU_DAYS = 6;

const DAY_MS = 24 * 60 * 60 * 1000;

// The 7 local dates (YYYY-MM-DD) of the week containing `today`, Monday first.
export function weekDates(today = getLocalDateString()) {
  const mondayOffset = (parseLocalDateString(today).getDay() + 6) % 7;
  const monday = shiftLocalDateString(today, -mondayOffset);
  return Array.from({ length: 7 }, (_, i) => shiftLocalDateString(monday, i));
}

// workout_logs rows → { [user_id]: Set of log_date }.
export function trainedDatesByClient(rows = []) {
  const out = {};
  rows.forEach(r => {
    if (!r?.user_id || !r.log_date) return;
    (out[r.user_id] || (out[r.user_id] = new Set())).add(r.log_date);
  });
  return out;
}

// One client's glance. `dates` is their Set of trained dates within the
// lookback window (or undefined when they have none).
export function clientGlance(client, dates, today = getLocalDateString(), now = Date.now()) {
  const week = weekDates(today);
  const trained = dates || new Set();
  const days = week.map(d => trained.has(d));
  const todayIndex = week.indexOf(today);

  let lastDate = null;
  trained.forEach(d => { if (d <= today && (!lastDate || d > lastDate)) lastDate = d; });
  const daysSince = lastDate
    ? Math.round((parseLocalDateString(today) - parseLocalDateString(lastDate)) / DAY_MS)
    : null;

  // Brand-new clients with no workout yet aren't "needing" anyone — they
  // just haven't started. Paused clients are out of scope entirely.
  const isNew = isNewSignup(client?.joined_at, now);
  const needsYou = !client?.paused_at && (
    daysSince === null ? !isNew : daysSince >= NEEDS_YOU_DAYS
  );

  let label;
  if (daysSince === null) label = needsYou ? `${GLANCE_LOOKBACK_DAYS}+ days since last workout` : 'No workouts yet';
  else if (needsYou) label = `${daysSince} days since last workout`;
  else if (daysSince === 0) label = 'Trained today';
  else if (daysSince === 1) label = 'Trained yesterday';
  else label = `Last workout ${daysSince} days ago`;

  return { days, todayIndex, weekCount: days.filter(Boolean).length, daysSince, needsYou, label };
}
