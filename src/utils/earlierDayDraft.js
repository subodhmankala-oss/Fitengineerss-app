// A workout left unfinished on an earlier day (no Save tapped, app closed)
// used to come back the next morning as "today's" session with its clock
// restarted, leaving only "continue as today" or "discard". Clients nearly
// always discarded to start the new day's workout, and the earlier day's
// sets were gone for good (Nagendra, 26 Oct 2026: 2 hours of ticked sets).
// These helpers let that draft be saved to the day it was actually done.

import { getLocalDateString } from './dateUtils';

const completedSets = (exercises) =>
  (exercises || []).flatMap(ex => (ex.sets || []).filter(s => s.isCompleted));

// Everything needed to save the draft back onto its own date, or null when
// it isn't from an earlier day or has nothing ticked (then there's nothing
// worth keeping and the usual "continue as today" behaviour applies).
//
// The session clock ends at the last ticked set, not now: the hours (or
// days) between leaving the app and coming back weren't workout. Expressed
// as an open pause from that moment, so every existing reader of
// startedAt/pauseIntervals (Finish summary, saved duration) stops there
// without needing to know about this case.
export function getEarlierDayDraft({ logDate, exercises, timerStartedAt, pauseIntervals, fallbackEndAt }, today = getLocalDateString()) {
  if (!logDate || logDate >= today) return null;
  const done = completedSets(exercises);
  if (done.length === 0) return null;

  const tickTimes = done.map(s => Number(s.completedAt)).filter(t => t > 0);
  const endAt = tickTimes.length > 0 ? Math.max(...tickTimes) : (Number(fallbackEndAt) || null);
  let startedAt = Number(timerStartedAt) || (tickTimes.length > 0 ? Math.min(...tickTimes) : null);
  if (startedAt && endAt && startedAt > endAt) startedAt = endAt;

  const intervals = (startedAt && endAt)
    ? [
      ...(pauseIntervals || [])
        .filter(p => p.pausedAt < endAt)
        .map(p => ({ pausedAt: p.pausedAt, resumedAt: p.resumedAt && p.resumedAt < endAt ? p.resumedAt : endAt })),
      { pausedAt: endAt, resumedAt: null }
    ]
    : [];

  return {
    logDate,
    completedSetCount: done.length,
    timerStartedAt: startedAt && endAt ? startedAt : null,
    pauseIntervals: intervals
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2026-10-26' -> 'Mon, 26 Oct' (parsed as a local date, never UTC; built by
// hand because toLocaleDateString punctuation differs between browsers).
export function formatDraftDate(logDate) {
  const [y, m, d] = String(logDate).split('-').map(Number);
  if (!y || !m || !d) return String(logDate);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${d} ${MONTHS[m - 1]}`;
}

// '2026-10-26' -> '26 Oct', for button labels.
export function shortDraftDate(logDate) {
  const [, m, d] = String(logDate).split('-').map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : String(logDate);
}
