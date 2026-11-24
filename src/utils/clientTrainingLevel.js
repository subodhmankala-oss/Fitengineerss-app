// Which experience level a client's weekly muscle targets follow.
//
// Same order as the AI builder's brief (programmingBrief.resolveLevel):
//   1. the experience level saved on client_training_profiles (set by the
//      coach or client in the AI Workout Builder);
//   2. the Workout Library level (clients.library_level), moved up one level
//      per 12 weeks of training since `since` (levelClock), exactly like
//      the home banner does (beginnerGuidance.guidanceFromPref);
//   3. null — callers then use levelFromHistory() below: the level the
//      client's own training time puts them at, the same 12-week clock the
//      home "next workout" card falls back to (beginnerGuidance.tenureLevel).
//      A client with nothing saved who is on "Beginner Full Body B" must
//      see beginner targets, not the intermediate default.

import { tenureLevel } from './beginnerGuidance.js';
import { getLocalDateString } from './dateUtils.js';
import { LEVEL_DAYS, levelClock } from './levelClock.js';

const LEVELS = ['beginner', 'intermediate', 'advanced'];

const normalize = (value) => {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  return LEVELS.find(l => v === l || (v.length >= 5 && v.startsWith(l.slice(0, 5)))) || null;
};

/**
 * @param {{experienceLevel?: string}|null} profile - getClientTrainingProfile()
 * @param {{level?: string, since?: string|null}|null} libraryPref - getLibraryLevelPref()
 * @param {number|Date} [now]
 * @param {{logs?: Array, breaks?: Array}} [history] - their workouts and breaks
 * @returns {'beginner'|'intermediate'|'advanced'|null}
 */
export function resolveClientTrainingLevel(profile, libraryPref, now = Date.now(), { logs, breaks } = {}) {
  const saved = normalize(profile?.experienceLevel);
  if (saved) return saved;
  const base = normalize(libraryPref?.level);
  if (!base) return null;
  const { days } = levelClock({
    start: libraryPref?.since, dates: workoutDates(logs), breaks, today: getLocalDateString(new Date(now))
  });
  const stepsUp = Math.floor(days / LEVEL_DAYS);
  return LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(base) + stepsUp)];
}

/**
 * Level from the client's own history when none is saved: first workout
 * under 12 weeks ago (or none yet) → beginner, 12–24 weeks → intermediate,
 * 24+ → advanced.
 * @param {Array<{log_date?: string, date?: string}>} logs - per-set rows or sessions
 */
export function levelFromHistory(logs, now = Date.now(), breaks = []) {
  return tenureLevel(workoutDates(logs).map(date => ({ date })), now, breaks);
}

/**
 * The level a screen's muscle targets use: the saved one, else the one the
 * client's training time puts them at.
 * @param {{profile: object|null, pref: object|null}|null} saved - useClientTrainingLevel()
 */
export function trainingLevelFor(saved, logs, breaks, now = Date.now()) {
  return (saved && resolveClientTrainingLevel(saved.profile, saved.pref, now, { logs, breaks: breaks || [] }))
    || levelFromHistory(logs, now, breaks || []);
}

// Distinct workout days of per-set rows or sessions.
function workoutDates(logs) {
  return [...new Set((logs || []).map(l => l.log_date || l.date).filter(Boolean))];
}
