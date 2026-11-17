// "Taking a break": a client tells their coach they'll be away. Shared by
// the client screens, the coach's client list, the Training Level decay
// (utils/trainingLevelDecay) and the server (api/save-user-data.js,
// api/push.js), so everyone agrees on which days a break covers.
//
// A break covers startDate .. backDate - 1; backDate is the day they're
// back. Dates are 'YYYY-MM-DD' local dates (see utils/dateUtils).
import { shiftLocalDateString, parseLocalDateString } from './dateUtils.js';

export const BREAK_REASONS = {
  holiday: { label: 'Holiday', status: 'On holiday', short: 'On holiday', coachVerb: 'is on holiday', color: '#38bdf8', rgb: '56,189,248' },
  illness: { label: 'Illness / injury', status: 'Off sick', short: 'Off sick', coachVerb: 'is off sick or injured', color: '#a78bfa', rgb: '167,139,250' },
  emergency: { label: 'Emergency', status: 'Away: emergency', short: 'Emergency', coachVerb: 'is away for an emergency', color: '#f87171', rgb: '248,113,113' },
  other: { label: 'Other', status: 'On a break', short: 'On a break', coachVerb: 'is taking a break', color: '#f59e0b', rgb: '245,158,11' },
};
export const BREAK_REASON_KEYS = Object.keys(BREAK_REASONS);

// "How long" chips on the sheet, in days.
export const BREAK_LENGTHS = [3, 5, 7, 14];
export const MAX_BREAK_DAYS = 92;
export const NOTE_MIN = 3;
export const NOTE_MAX = 500;

// How long the "Welcome back" card stays after a break ends (unless they
// log a workout first).
export const WELCOME_BACK_DAYS = 3;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(fromDate, toDate) {
  return Math.round((parseLocalDateString(toDate) - parseLocalDateString(fromDate)) / DAY_MS);
}

// Server row → what the app uses.
export function normalizeBreak(row) {
  if (!row) return null;
  return {
    id: row.id,
    clientUserId: row.client_user_id,
    reason: BREAK_REASONS[row.reason] ? row.reason : 'other',
    note: row.note || '',
    startDate: row.start_date,
    backDate: row.back_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function isBreakDay(breaks, date) {
  return (breaks || []).some(b => b.startDate <= date && date < b.backDate);
}

// The break covering `today`, or null.
export function activeBreak(breaks, today) {
  return (breaks || []).find(b => b.startDate <= today && today < b.backDate) || null;
}

// A break that ended in the last WELCOME_BACK_DAYS days (the most recent),
// or null. `lastWorkoutDate` hides it once they've trained since coming back.
export function recentlyEndedBreak(breaks, today, lastWorkoutDate = null) {
  const ended = (breaks || [])
    .filter(b => b.backDate <= today && daysBetween(b.backDate, today) < WELCOME_BACK_DAYS)
    .sort((a, b) => (a.backDate < b.backDate ? 1 : -1))[0];
  if (!ended) return null;
  if (lastWorkoutDate && lastWorkoutDate >= ended.backDate) return null;
  if (activeBreak(breaks, today)) return null;
  return ended;
}

// Latest log date in workout_logs rows (or app sessions), or null.
export function lastWorkoutDateOf(logs) {
  let last = null;
  (logs || []).forEach(l => { const d = l.log_date || l.date; if (d && (!last || d > last)) last = d; });
  return last;
}

// First workout back: every exercise capped at 2 sets ("Easy restart").
export function easyRestartProgram(program) {
  if (!program) return program;
  return {
    ...program,
    exercises: (program.exercises || []).map(ex => ({
      ...ex,
      sets: Array.isArray(ex.sets) ? ex.sets.slice(0, 2) : Math.min(2, Number(ex.sets) || 0) || ex.sets,
    })),
  };
}

// Days strictly after `afterDate`, up to and including `toDate`, that a
// break covers.
export function breakDaysBetween(breaks, afterDate, toDate) {
  if (!breaks?.length || !afterDate || !toDate || toDate <= afterDate) return 0;
  let count = 0;
  for (let d = shiftLocalDateString(afterDate, 1); d <= toDate; d = shiftLocalDateString(d, 1)) {
    if (isBreakDay(breaks, d)) count += 1;
  }
  return count;
}

// 'Mon 23 Nov'
export function formatBreakDate(date) {
  if (!date || !DATE_RE.test(date)) return '';
  return parseLocalDateString(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// '23 Nov'
export function formatBreakDateShort(date) {
  if (!date || !DATE_RE.test(date)) return '';
  return parseLocalDateString(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function breakLengthLabel(days) {
  if (days === 7) return '1 week';
  if (days === 14) return '2 weeks';
  return `${days} day${days === 1 ? '' : 's'}`;
}

// The coach's push / bell title: "Asha Rao is on holiday, back Mon 23 Nov (5 days)".
export function coachBreakTitle(clientName, b) {
  const meta = BREAK_REASONS[b.reason] || BREAK_REASONS.other;
  const days = daysBetween(b.startDate, b.backDate);
  return `${clientName} ${meta.coachVerb}, back ${formatBreakDate(b.backDate)} (${breakLengthLabel(days)})`;
}

// Server-side check of what the client sent. `today` is the server's idea
// of the client's local date; the client's own startDate may be a day either
// side (time zones). Returns { ok, value } or { ok: false, error }.
export function cleanBreakInput(input, today) {
  const reason = String(input?.reason || '');
  const note = String(input?.note || '').trim().replace(/\s+/g, ' ');
  const startDate = String(input?.startDate || '');
  const backDate = String(input?.backDate || '');
  if (!BREAK_REASONS[reason]) return { ok: false, error: 'Pick a reason.' };
  if (note.length < NOTE_MIN) return { ok: false, error: 'Add a short note so your coach knows.' };
  if (note.length > NOTE_MAX) return { ok: false, error: `Keep the note under ${NOTE_MAX} characters.` };
  if (!DATE_RE.test(startDate) || !DATE_RE.test(backDate)) return { ok: false, error: 'Pick when you\'re back.' };
  if (Math.abs(daysBetween(today, startDate)) > 1) return { ok: false, error: 'A break starts today.' };
  const days = daysBetween(startDate, backDate);
  if (days < 1) return { ok: false, error: 'The back date must be after today.' };
  if (days > MAX_BREAK_DAYS) return { ok: false, error: 'A break can be up to 3 months.' };
  return { ok: true, value: { reason, note, startDate, backDate } };
}
