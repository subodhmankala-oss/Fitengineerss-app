import { breakDaysBetween, daysBetween } from './clientBreaks.js';
import { getLocalDateString, shiftLocalDateString } from './dateUtils.js';

// How far a client is through the 12-weeks-per-level clock, counting
// training time instead of calendar time (2026-11-25: "Week 4 of 12 is wrong
// if a user has not trained for long").
//
// - Days count while the client keeps training: a gap of under 7 full days
//   without a workout changes nothing, so once a week is enough.
// - Every full week without a workout doesn't count, and takes 3 days back.
// - Days on a break ("Taking a break") don't count, and take nothing back.
// - It never goes back past the start of the level it had reached.
//
// Shared by the Home card (beginnerGuidance) and the muscle targets
// (clientTrainingLevel), so both change level on the same day.

export const WEEKS_PER_LEVEL = 12;
export const LEVEL_DAYS = WEEKS_PER_LEVEL * 7;
export const DAYS_BACK_PER_IDLE_WEEK = 3;
// How long after coming back the drop stays on the bar.
const SHOW_DROP_DAYS = 7;

// The rule's first week. Before it the clock was the calendar; whoever was
// on a level by then keeps it.
export const RULE_FROM = '2026-11-23';

const levelStart = (days) => Math.floor(days / LEVEL_DAYS) * LEVEL_DAYS;

/**
 * @param {object} o
 * @param {string} o.start            YYYY-MM-DD the clock starts
 * @param {Iterable<string>} o.dates  workout days (YYYY-MM-DD), any order
 * @param {Array} [o.breaks]          normalized client breaks
 * @param {string} [o.today]
 * @returns {{ days: number, lost: number }} days on the clock, and how many
 *   the latest time away took back (0 once they've been back a week)
 */
export function levelClock({ start, dates, breaks, today = getLocalDateString() }) {
  if (!start || start >= today) return { days: 0, lost: 0 };
  if (today < RULE_FROM) return { days: daysBetween(start, today), lost: 0 };

  const workouts = [...new Set(dates || [])].filter(d => d > start && d <= today).sort();
  const points = workouts.at(-1) === today ? workouts : [...workouts, today];
  let days = 0;
  let lost = 0;
  let ruled = start >= RULE_FROM;
  let from = start;
  points.forEach(to => {
    const counted = daysBetween(from, to) - breakDaysBetween(breaks, from, shiftLocalDateString(to, -1));
    // Full days with no workout between the two.
    const idleWeeks = Math.floor(Math.max(0, counted - 1) / 7);
    // The level is reached while the first week away still counts.
    const floor = levelStart(days + Math.min(7, counted));
    const back = Math.max(floor, days + counted - idleWeeks * (7 + DAYS_BACK_PER_IDLE_WEEK));
    if (idleWeeks > 0) lost = daysBetween(to, today) < SHOW_DROP_DAYS ? Math.max(0, Math.min(idleWeeks * DAYS_BACK_PER_IDLE_WEEK, days - floor)) : 0;
    days = back;
    if (!ruled && to >= RULE_FROM) {
      ruled = true;
      days = Math.max(days, levelStart(daysBetween(start, RULE_FROM)));
    }
    from = to;
  });
  return { days, lost };
}
