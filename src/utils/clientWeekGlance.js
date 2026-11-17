// Coach client list "glance": for each client, which days of this week
// (Mon–Sun) they trained, and whether they need the coach (no workout for a
// while). Built from workout_logs rows (one per set) — the same rows
// CoachQuietClients fetches via getRecentWorkoutRowsForClients.
import { getLocalDateString, shiftLocalDateString, parseLocalDateString } from './dateUtils';
import { isNewSignup } from './activityStatus';
import { activeBreak, isBreakDay, breakDaysBetween, daysBetween, formatBreakDateShort } from './clientBreaks';

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
// lookback window (or undefined when they have none). `breaks`: their
// "Taking a break" breaks (utils/clientBreaks) — while one runs they're
// `away` (never "needs you"), and break days don't count as idle after.
export function clientGlance(client, dates, today = getLocalDateString(), now = Date.now(), breaks = []) {
  const week = weekDates(today);
  const trained = dates || new Set();
  const days = week.map(d => trained.has(d));
  const offDays = week.map(d => !trained.has(d) && isBreakDay(breaks, d));
  const todayIndex = week.indexOf(today);
  const away = activeBreak(breaks, today);

  let lastDate = null;
  trained.forEach(d => { if (d <= today && (!lastDate || d > lastDate)) lastDate = d; });
  const daysSince = lastDate
    ? Math.round((parseLocalDateString(today) - parseLocalDateString(lastDate)) / DAY_MS)
    : null;
  const idleSince = daysSince === null ? null : daysSince - breakDaysBetween(breaks, lastDate, today);

  // Brand-new clients with no workout yet aren't "needing" anyone — they
  // just haven't started. Paused clients are out of scope entirely.
  const isNew = isNewSignup(client?.joined_at, now);
  // No workout in the window: back from a break only days ago doesn't count yet.
  const lastBack = (breaks || []).reduce((m, b) => (b.backDate <= today && (!m || b.backDate > m) ? b.backDate : m), null);
  const justBack = !!lastBack && daysBetween(lastBack, today) < NEEDS_YOU_DAYS;
  const needsYou = !client?.paused_at && !away && (
    daysSince === null ? !isNew && !justBack : idleSince >= NEEDS_YOU_DAYS
  );

  let label;
  if (away) label = `Back ${formatBreakDateShort(away.backDate)}`;
  else if (daysSince === null) label = needsYou ? `${GLANCE_LOOKBACK_DAYS}+ days since last workout` : 'No workouts yet';
  else if (needsYou) label = `${daysSince} days since last workout`;
  else if (daysSince === 0) label = 'Trained today';
  else if (daysSince === 1) label = 'Trained yesterday';
  else label = `Last workout ${daysSince} days ago`;

  return { days, offDays, away, todayIndex, weekCount: days.filter(Boolean).length, daysSince, needsYou, label };
}
