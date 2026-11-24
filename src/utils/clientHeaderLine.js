// Coach client header (phones): the "Legs · yesterday" line under the name.
import { getLocalDateString, parseLocalDateString } from './dateUtils';

// Names a session gets when nobody named it — "Trained yesterday" says more.
const UNNAMED = new Set(['', 'custom routine', 'live routine', 'live log', 'workout', 'custom workout']);

const count = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

function whenText(date, today) {
  const days = Math.round((parseLocalDateString(today) - parseLocalDateString(date)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return count(days, 'day');
  if (days < 60) return count(Math.floor(days / 7), 'week');
  return count(Math.floor(days / 30), 'month');
}

/**
 * Last workout as { name, when }: name is null when the session has no real
 * name. Null when the client has no workout yet.
 */
export function lastWorkoutLine(sessions, today = getLocalDateString()) {
  const last = (sessions || []).reduce((best, s) => (
    s?.date && s.date <= today && (!best || s.date > best.date) ? s : best
  ), null);
  if (!last) return null;
  const name = String(last.planName || '').trim();
  return { name: UNNAMED.has(name.toLowerCase()) ? null : name, when: whenText(last.date, today) };
}
