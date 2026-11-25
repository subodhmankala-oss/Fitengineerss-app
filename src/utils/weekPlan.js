import { pickNextProgramInRotation } from './beginnerGuidance.js';
import { getLocalDateString, parseLocalDateString, shiftLocalDateString } from './dateUtils.js';

// A self-guided client's training days → the workout cards for this week
// (WeekPlanCard, on Home). Days are 0 = Monday … 6 = Sunday.

export const DEFAULT_TRAINING_DAYS = [0, 2, 5];
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const squash = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const sameProgram = (a, b) => squash(a) === squash(b);

// Sorted, unique, 0–6. Null when nothing usable is left.
export function cleanTrainingDays(days) {
  if (!Array.isArray(days)) return null;
  const out = [...new Set(days.map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  return out.length ? out : null;
}

export function dayIndexOf(dateStr) {
  return (parseLocalDateString(dateStr).getDay() + 6) % 7;
}

export function mondayOf(dateStr) {
  return shiftLocalDateString(dateStr, -dayIndexOf(dateStr));
}

// One entry per program per day, with that session's calories (a
// per-session value repeated on every set row).
export function sessionsFromLogs(logs) {
  const byKey = new Map();
  (logs || []).forEach(log => {
    const date = log.log_date;
    const planName = log.plan_name || log.planName || '';
    if (!date || !planName) return;
    const key = `${date}|${squash(planName)}`;
    const kcal = Number(log.calories_burned) || 0;
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, { date, planName, kcal });
    else if (kcal > existing.kcal) existing.kcal = kcal;
  });
  return [...byKey.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * This week's cards.
 *
 * Workouts follow the level's program order, carrying on from the last one
 * done before the week (or before the day the plan was made, when that's
 * this week) — so the cards don't move when one is done. A card is ticked
 * by its own program logged any day since then: doing Saturday's on Thursday
 * ticks Saturday's. Days before the plan was made aren't shown as missed;
 * program workouts done on them are, ticked.
 *
 * @param programs   the level's Workout Library programs, in rotation order
 * @param sessions   sessionsFromLogs()
 * @param days       training days, 0 = Monday
 * @param since      YYYY-MM-DD the days were chosen
 * @returns {null | { slots, main, doneCount, weekDone, nextWeek, nextProgram }}
 *   slots: [{ date, program, done, doneOn, kcal, isToday, isPast }] (doneOn:
 *   the day it was saved), main: the one to do — today's, else the next one coming up, else the first missed.
 *   nextWeek: no chosen day was left this week, so these are next week's.
 *   nextProgram: what comes after the last one done (for a finished week).
 */
export function buildWeekPlan({ programs, sessions, days, since, today = getLocalDateString() }) {
  const chosen = cleanTrainingDays(days) || DEFAULT_TRAINING_DAYS;
  if (!Array.isArray(programs) || programs.length === 0) return null;
  const all = sessions || [];
  const byName = new Map(programs.map(p => [squash(p.name), p]));
  const startAfter = (list) => programs.indexOf(pickNextProgramInRotation(programs, list).program);

  const monday = mondayOf(today);
  const cutoff = since && since > monday ? since : monday;
  const dates = chosen.map(d => shiftLocalDateString(monday, d)).filter(d => d >= cutoff);
  const nextProgram = programs[startAfter(all)];

  if (dates.length === 0) {
    const start = startAfter(all);
    const nextMonday = shiftLocalDateString(monday, 7);
    const slots = chosen.map((d, i) => ({
      date: shiftLocalDateString(nextMonday, d), program: programs[(start + i) % programs.length],
      done: false, kcal: 0, isToday: false, isPast: false
    }));
    return { slots, main: slots[0], doneCount: 0, weekDone: false, nextWeek: true, nextProgram };
  }

  const matched = all.filter(s => s.date >= monday && s.date <= today && byName.has(squash(s.planName)));
  const before = matched.filter(s => s.date < cutoff).map(s => ({
    date: s.date, program: byName.get(squash(s.planName)), done: true, doneOn: s.date, kcal: s.kcal || 0, isToday: false, isPast: true
  }));
  // Sessions still free to tick a card; each ticks one.
  const free = matched.filter(s => s.date >= cutoff);
  const start = startAfter(all.filter(s => s.date < cutoff));
  const planned = dates.map((date, i) => {
    const program = programs[(start + i) % programs.length];
    const at = free.findIndex(s => squash(s.planName) === squash(program.name));
    const session = at >= 0 ? free.splice(at, 1)[0] : null;
    return { date, program, done: !!session, doneOn: session?.date || null, kcal: session?.kcal || 0, isToday: date === today, isPast: date < today };
  });

  const slots = [...before, ...planned];
  const open = planned.filter(s => !s.done);
  const main = open.find(s => s.isToday) || open.find(s => !s.isPast) || open[0] || null;
  return { slots, main, doneCount: slots.length - open.length, weekDone: open.length === 0, nextWeek: false, nextProgram };
}
