// Which experience level a client's weekly muscle targets follow.
//
// Same order as the AI builder's brief (programmingBrief.resolveLevel):
//   1. the experience level saved on client_training_profiles (set by the
//      coach or client in the AI Workout Builder);
//   2. the Workout Library level (clients.library_level), moved up one level
//      per 12 weeks since `since`, exactly like the home banner does
//      (beginnerGuidance.guidanceFromPref);
//   3. null — callers then use levelFromHistory() below: the level the
//      client's own training time puts them at, the same 12-week clock the
//      home "next workout" card falls back to (beginnerGuidance.tenureLevel).
//      A client with nothing saved who is on "Beginner Full Body B" must
//      see beginner targets, not the intermediate default.

import { tenureLevel } from './beginnerGuidance.js';

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const WEEKS_PER_LEVEL = 12;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const normalize = (value) => {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  return LEVELS.find(l => v === l || (v.length >= 5 && v.startsWith(l.slice(0, 5)))) || null;
};

/**
 * @param {{experienceLevel?: string}|null} profile - getClientTrainingProfile()
 * @param {{level?: string, since?: string|null}|null} libraryPref - getLibraryLevelPref()
 * @param {number|Date} [now]
 * @returns {'beginner'|'intermediate'|'advanced'|null}
 */
export function resolveClientTrainingLevel(profile, libraryPref, now = Date.now()) {
  const saved = normalize(profile?.experienceLevel);
  if (saved) return saved;
  const base = normalize(libraryPref?.level);
  if (!base) return null;
  const nowMs = now instanceof Date ? now.getTime() : now;
  const sinceMs = libraryPref?.since ? new Date(`${libraryPref.since}T00:00:00`).getTime() : nowMs;
  const stepsUp = Number.isFinite(sinceMs) ? Math.floor(Math.max(0, nowMs - sinceMs) / WEEK_MS / WEEKS_PER_LEVEL) : 0;
  return LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(base) + stepsUp)];
}

/**
 * Level from the client's own history when none is saved: first workout
 * under 12 weeks ago (or none yet) → beginner, 12–24 weeks → intermediate,
 * 24+ → advanced.
 * @param {Array<{log_date?: string, date?: string}>} logs - per-set rows or sessions
 */
export function levelFromHistory(logs, now = Date.now()) {
  const sessions = (logs || []).map(l => ({ date: l.log_date || l.date })).filter(s => s.date);
  return tenureLevel(sessions, now);
}
