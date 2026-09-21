// ─── MONTHLY PROGRESS REPORT ENGINE ───
// Pure calculation for the coach → client monthly report (see
// sql/supabase_monthly_progress_reports.sql). Reads only raw workout_logs
// rows (the same array TrainerDashboard / WorkoutProgressDashboard already
// hold) and produces a snapshot the coach reviews and sends. Nothing here
// touches the network, so it's unit-tested directly.
//
// Volume/set rules are shared with the weekly muscle analytics
// (getSetVolumeKg / isCountableSet) so the monthly numbers can't disagree
// with what the client sees on the Muscles tab.

import { getSetVolumeKg, isCountableSet } from './muscleAnalytics.js';
import { isCardioExercise, isTimedExercise, isLoadedCarryExercise } from '../data/exerciseLibrary.js';

// "2026-08" for a Date, in LOCAL time (log_date is a local YYYY-MM-DD).
export function monthKeyOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Shift a "YYYY-MM" key by n months (negative = back).
export function shiftMonthKey(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthKeyOf(d);
}

// "YYYY-MM" → "Aug 2026" / "Aug" for column headers.
export function formatMonthKey(monthKey, { withYear = true } = {}) {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-US', withYear ? { month: 'short', year: 'numeric' } : { month: 'short' });
}

// First day of the month as a DATE string for the report_month column.
export function monthKeyToDate(monthKey) {
  return `${monthKey}-01`;
}

// DATE column value ("2026-08-01") → "2026-08".
export function dateToMonthKey(dateStr) {
  return String(dateStr || '').slice(0, 7);
}

// The last COMPLETED month relative to `now` — the sensible default for a
// coach opening the composer on the 1st–5th to review what just finished.
export function defaultReportMonth(now = new Date()) {
  return shiftMonthKey(monthKeyOf(now), -1);
}

const daysInMonth = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

// A "lift" for the top-lifts / PR logic: a loaded, rep-based set. Cardio,
// timed holds and carries have no meaningful weight × reps.
const isLiftRow = (log) => {
  const name = log.exercise_name;
  if (!name || isCardioExercise(name) || isTimedExercise(name) || isLoadedCarryExercise(name)) return false;
  return (parseFloat(log.weight_kg) || 0) > 0 && (parseInt(log.reps, 10) || 0) > 0;
};

/**
 * Best (heaviest) working set per exercise across a set of rows.
 * @returns {Object<string, {exercise, bestWeightKg, bestReps}>}
 */
function bestLiftsByExercise(rows) {
  const best = {};
  rows.forEach(r => {
    if (!isCountableSet(r) || !isLiftRow(r)) return;
    const w = parseFloat(r.weight_kg) || 0;
    const reps = parseInt(r.reps, 10) || 0;
    const cur = best[r.exercise_name];
    if (!cur || w > cur.bestWeightKg || (w === cur.bestWeightKg && reps > cur.bestReps)) {
      best[r.exercise_name] = { exercise: r.exercise_name, bestWeightKg: w, bestReps: reps };
    }
  });
  return best;
}

/**
 * Stats for ONE calendar month.
 *
 * @param {Array} logs - raw workout_logs rows
 * @param {string} monthKey - "YYYY-MM"
 * @returns {{
 *   month, sessions, activeDays, totalSets, totalVolumeKg, totalDurationSec,
 *   totalCalories, distinctExercises, sessionsPerWeek, prCount,
 *   topLifts: Array<{exercise, bestWeightKg, bestReps, prevBestWeightKg}>,
 *   bestLifts: Object<string, {exercise, bestWeightKg, bestReps}>
 * }}
 *
 * A "session" is one client + log_date + plan_name (same grouping as
 * getWorkoutSummaryForCoach). duration_seconds / calories_burned are
 * duplicated onto every row of a session, so they're read from the first
 * row that has them, once per session.
 *
 * prCount = exercises whose best weight this month beat their all-time best
 * from BEFORE this month (needs the full log history, which every caller
 * has — the coach's client detail view and the client's own dashboard both
 * fetch all logs).
 */
export function computeMonthStats(logs, monthKey) {
  const rows = (logs || []).filter(r => r && typeof r.log_date === 'string' && r.log_date.startsWith(monthKey));
  const before = (logs || []).filter(r => r && typeof r.log_date === 'string' && r.log_date < `${monthKey}-01`);

  const sessions = {};
  const days = new Set();
  const exercises = new Set();
  let totalSets = 0;
  let totalVolumeKg = 0;

  rows.forEach(r => {
    const key = `${r.log_date}|${r.plan_name || 'Custom Routine'}`;
    if (!sessions[key]) sessions[key] = { durationSec: null, calories: null };
    const s = sessions[key];
    if (s.durationSec == null && r.duration_seconds != null) s.durationSec = Number(r.duration_seconds) || 0;
    if (s.calories == null && r.calories_burned != null) s.calories = Number(r.calories_burned) || 0;
    days.add(r.log_date);
    if (r.exercise_name) exercises.add(r.exercise_name);
    if (isCountableSet(r)) totalSets += 1;
    totalVolumeKg += getSetVolumeKg(r);
  });

  const sessionList = Object.values(sessions);
  const totalDurationSec = sessionList.reduce((sum, s) => sum + (s.durationSec || 0), 0);
  const totalCalories = sessionList.reduce((sum, s) => sum + (s.calories || 0), 0);

  const bestLifts = bestLiftsByExercise(rows);
  const priorBest = bestLiftsByExercise(before);
  let prCount = 0;
  Object.values(bestLifts).forEach(b => {
    const prev = priorBest[b.exercise];
    if (prev && b.bestWeightKg > prev.bestWeightKg) prCount += 1;
  });

  // Top lifts: heaviest three, with last-month-or-earlier best for the delta.
  const topLifts = Object.values(bestLifts)
    .sort((a, b) => b.bestWeightKg - a.bestWeightKg)
    .slice(0, 3)
    .map(b => ({ ...b, prevBestWeightKg: priorBest[b.exercise] ? priorBest[b.exercise].bestWeightKg : null }));

  const weeks = daysInMonth(monthKey) / 7;

  return {
    month: monthKey,
    sessions: sessionList.length,
    activeDays: days.size,
    totalSets,
    totalVolumeKg: Math.round(totalVolumeKg),
    totalDurationSec,
    totalCalories: Math.round(totalCalories),
    distinctExercises: exercises.size,
    sessionsPerWeek: Math.round((sessionList.length / weeks) * 10) / 10,
    prCount,
    topLifts,
    bestLifts
  };
}

const DELTA_KEYS = ['sessions', 'activeDays', 'totalSets', 'totalVolumeKg', 'totalDurationSec', 'totalCalories', 'sessionsPerWeek', 'prCount'];

/**
 * Absolute + percent change for each headline metric. pct is null when the
 * previous value is 0 (no meaningful percentage) or when there is no
 * previous month at all.
 */
export function computeDeltas(current, previous) {
  const deltas = {};
  DELTA_KEYS.forEach(k => {
    const cur = current ? current[k] : 0;
    if (!previous || !previous.hasData) { deltas[k] = { abs: null, pct: null }; return; }
    const prev = previous[k] || 0;
    const abs = Math.round((cur - prev) * 10) / 10;
    const pct = prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);
    deltas[k] = { abs, pct };
  });
  return deltas;
}

/**
 * The full snapshot stored in monthly_progress_reports.stats.
 *
 * @param {Array} logs - full workout_logs history for the client
 * @param {string} monthKey - the month being reported ("YYYY-MM")
 */
export function buildMonthlyReport(logs, monthKey) {
  const withFlag = (s) => ({ ...s, hasData: s.sessions > 0 });
  const current = withFlag(computeMonthStats(logs, monthKey));
  const previous = withFlag(computeMonthStats(logs, shiftMonthKey(monthKey, -1)));
  const prevPrevious = withFlag(computeMonthStats(logs, shiftMonthKey(monthKey, -2)));
  // bestLifts is only needed to derive the columns below; keep the stored
  // snapshot small.
  const strip = (s) => { const { bestLifts: _omit, ...rest } = s; return rest; };

  // Per-exercise best weight across the three columns, for the top lifts
  // rows on the client card ("Squat best: 85 / 92.5 / 100").
  const liftRows = current.topLifts.map(t => ({
    exercise: t.exercise,
    prevPrevious: prevPrevious.bestLifts[t.exercise] ? prevPrevious.bestLifts[t.exercise].bestWeightKg : null,
    previous: previous.bestLifts[t.exercise] ? previous.bestLifts[t.exercise].bestWeightKg : null,
    current: t.bestWeightKg,
    currentReps: t.bestReps
  }));

  return {
    version: 1,
    month: monthKey,
    current: strip(current),
    previous: strip(previous),
    prevPrevious: strip(prevPrevious),
    deltas: computeDeltas(current, previous),
    liftRows
  };
}

// ── Formatting helpers shared by the coach composer and client card ──

export function formatVolume(kg) {
  if (kg == null) return '—';
  if (kg >= 10000) return `${(kg / 1000).toFixed(1)}t`;
  return `${Math.round(kg).toLocaleString('en-IN')} kg`;
}

export function formatDurationShort(sec) {
  if (sec == null) return '—';
  const mins = Math.round(sec / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// "▲ +3" / "▼ −18%" / "" — sign-aware, with direction for colouring.
export function formatDelta(delta, { pct = false, suffix = '' } = {}) {
  if (!delta) return { text: '', dir: 'flat' };
  const v = pct ? delta.pct : delta.abs;
  if (v == null) return { text: '', dir: 'flat' };
  if (v === 0) return { text: '—', dir: 'flat' };
  const dir = v > 0 ? 'up' : 'down';
  const arrow = v > 0 ? '▲' : '▼';
  const num = Math.abs(v);
  return { text: `${arrow} ${num}${pct ? '%' : suffix}`, dir };
}

/**
 * Pre-filled coach message. Plain English, numbers only where they help,
 * always editable before sending.
 */
export function suggestCoachMessage(report, clientFirstName = 'there') {
  const c = report.current;
  const d = report.deltas;
  const monthName = formatMonthKey(report.month, { withYear: false });
  if (!c.hasData) {
    return `Hi ${clientFirstName}, I didn't see any logged workouts in ${monthName}. Let's get back on track this month — even two sessions a week makes a difference.`;
  }
  const parts = [];
  const sessionsBit = d.sessions.abs != null && d.sessions.abs > 0
    ? `${c.sessions} sessions in ${monthName}, up from ${c.sessions - d.sessions.abs}`
    : `${c.sessions} sessions in ${monthName}`;
  parts.push(sessionsBit);
  if (d.totalVolumeKg.pct != null && d.totalVolumeKg.pct !== 0) {
    parts.push(`volume ${d.totalVolumeKg.pct > 0 ? 'up' : 'down'} ${Math.abs(d.totalVolumeKg.pct)}%`);
  }
  if (c.prCount > 0) parts.push(`${c.prCount} new PR${c.prCount === 1 ? '' : 's'}`);
  const lead = d.sessions.abs != null && d.sessions.abs < 0 ? 'Solid effort' : 'Great month';
  const top = c.topLifts[0];
  const topBit = top ? ` ${top.exercise} moved to ${top.bestWeightKg} kg.` : '';
  return `${lead}, ${clientFirstName}. ${parts.join(', ')}.${topBit} Let's keep building next month.`;
}

// ── Flavour: the bits that make the client card feel like a highlight reel
// rather than a ledger. Pure functions of the snapshot; tested alongside the
// numbers so the copy can't drift out of sync with them.

// Consistency tier from sessions/week — the number every coach actually
// cares about. Thresholds are deliberately generous at the bottom so a
// client's first report never opens with a scolding.
export function consistencyTier(sessionsPerWeek) {
  const n = sessionsPerWeek || 0;
  if (n >= 4) return { label: 'On fire', emoji: '🔥', tone: 'hot' };
  if (n >= 2.5) return { label: 'Consistent', emoji: '💪', tone: 'good' };
  if (n >= 1.5) return { label: 'Building', emoji: '📈', tone: 'ok' };
  if (n > 0) return { label: 'Warming up', emoji: '🌱', tone: 'start' };
  return { label: 'Rest month', emoji: '😴', tone: 'none' };
}

// "1,800 kg — that's like lifting 1.8 small cars". Largest unit that fits at
// least once, so the multiplier stays readable (1.8 cars, not 0.36 rhinos).
const VOLUME_UNITS = [
  { kg: 150000, one: 'a blue whale', many: 'blue whales' },
  { kg: 40000, one: 'a loaded truck', many: 'loaded trucks' },
  { kg: 12000, one: 'a school bus', many: 'school buses' },
  { kg: 5000, one: 'an elephant', many: 'elephants' },
  { kg: 2000, one: 'a rhino', many: 'rhinos' },
  { kg: 1000, one: 'a small car', many: 'small cars' },
  { kg: 400, one: 'a grizzly bear', many: 'grizzly bears' },
  { kg: 150, one: 'a grand piano', many: 'grand pianos' },
  { kg: 60, one: 'a fridge', many: 'fridges' }
];
export function volumeEquivalent(kg) {
  if (!kg || kg < 60) return null;
  const unit = VOLUME_UNITS.find(u => kg >= u.kg);
  if (!unit) return null;
  const n = Math.round((kg / unit.kg) * 10) / 10;
  if (n < 1.05) return `that's like lifting ${unit.one}`;
  const shown = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `that's like lifting ${shown} ${unit.many}`;
}

// One punchy headline for the card. Picks the single most flattering true
// statement, in priority order: PRs > big volume jump > more sessions >
// plain summary.
export function reportHeadline(report) {
  const c = report.current;
  const d = report.deltas || {};
  if (!c || !c.hasData) return 'A quiet month — next one starts fresh';
  if (c.prCount >= 2) return `${c.prCount} personal records this month 🏆`;
  if (c.prCount === 1 && c.topLifts[0]) return `New PR: ${c.topLifts[0].exercise} ${c.topLifts[0].bestWeightKg} kg 🏆`;
  if (d.totalVolumeKg && d.totalVolumeKg.pct != null && d.totalVolumeKg.pct >= 10) return `Volume up ${d.totalVolumeKg.pct}% on last month 📈`;
  if (d.sessions && d.sessions.abs != null && d.sessions.abs > 0) return `${d.sessions.abs} more session${d.sessions.abs === 1 ? '' : 's'} than last month 💪`;
  return `${c.sessions} session${c.sessions === 1 ? '' : 's'} · ${formatVolume(c.totalVolumeKg)} moved`;
}
