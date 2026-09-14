// Picks which Workout Library program to recommend next on the client's
// Home screen — a simple round-robin through whichever level's programs
// (in the order the library returns them, i.e. created_at asc), based on
// which one they most recently logged. Level itself (Beginner/Intermediate/
// Advanced) is decided by determineWorkoutGuidance below, on a genuine
// ~3-month-per-level tenure clock — see WEEKS_PER_LEVEL there. Deliberately
// a separate clock from the coaching "Training Level" tenure system
// (WorkoutTracker's skillLevel) — same underlying idea, different
// boundaries and purpose, kept independent so this never touches
// coach-facing UI.

// Squash a name down to just its letters/digits, lowercased — same
// normalization videoUtils.findExerciseGuideMatch uses, so a session saved
// with slightly different spacing/case than the library entry ("beginner
// full body a" vs "Beginner Full Body A") still matches.
const squash = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * @param {Array<{name: string}>} beginnerPrograms - Beginner Workout Library
 *   entries, in rotation order (getGenericWorkoutsByLevel('beginner')'s order).
 * @param {Array<{date: string, planName: string}>} sessions - the client's
 *   logged sessions (one entry per distinct date), any order.
 * @returns {{ program: object, reason: 'no-sessions' | 'no-beginner-session' | 'rotation', lastProgram: object | null } | null}
 *   `program` is what to suggest next; null only when there are no Beginner
 *   programs to suggest at all. `reason` distinguishes messaging:
 *     - 'no-sessions': the client has never logged anything — start at the
 *       first program.
 *     - 'no-beginner-session': they've logged workouts, but never one of
 *       the named Beginner programs (e.g. only custom/coach sessions so
 *       far) — still start at the first program.
 *     - 'rotation': they've completed a Beginner program before — suggest
 *       the next one after it, wrapping back to the first after the last.
 */
export function pickNextBeginnerProgram(beginnerPrograms, sessions) {
  return pickNextProgramInRotation(beginnerPrograms, sessions);
}

// Same function, named for what it actually does now that the guidance
// system covers every level, not just Beginner — pickNextBeginnerProgram
// above is kept as a thin alias so existing callers/tests don't need to
// change.
export function pickNextProgramInRotation(programs, sessions) {
  if (!Array.isArray(programs) || programs.length === 0) return null;

  if (!Array.isArray(sessions) || sessions.length === 0) {
    return { program: programs[0], reason: 'no-sessions', lastProgram: null };
  }

  const byName = new Map(programs.map((p, i) => [squash(p.name), i]));

  // Most recent session (by date) that matches a named program from this list.
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const lastMatch = sorted.find(s => byName.has(squash(s.planName)));

  if (!lastMatch) {
    return { program: programs[0], reason: 'no-beginner-session', lastProgram: null };
  }

  const lastIndex = byName.get(squash(lastMatch.planName));
  const nextIndex = (lastIndex + 1) % programs.length;
  return { program: programs[nextIndex], reason: 'rotation', lastProgram: programs[lastIndex] };
}

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const CATEGORIES = ['gym', 'home'];

// Each level is a genuine ~3-month journey, not "done the checklist, move
// on" — a real beginner needs that long adapting regardless of how quickly
// they cycle through 3 programs. One continuous clock from the client's
// very first-ever logged session (any category, any program — this is
// "how long have they been training", not per-category): weeks 0-12 =
// Beginner, 12-24 = Intermediate, 24-36 = Advanced, and it stays Advanced
// after that (nothing higher to reach). Deliberately independent of the
// coaching "Training Level" bar (WorkoutTracker's skillLevel) — that has
// its own boundaries and a 0-100 consistency/overload score, for a
// different purpose (gating which tier a coach sees a client at); kept
// fully separate on purpose rather than unified, so this doesn't touch
// coach-facing UI coaches already rely on.
const WEEKS_PER_LEVEL = 12;

// Distinct program names (squashed) from `programs` that appear anywhere in
// `sessions` — used only for the "never go backward" floor below (has the
// client EVER actually done a session at a higher level, e.g. coach-
// assigned Advanced work with no Beginner history at all).
function completedProgramNames(programs, sessions) {
  const names = new Set((programs || []).map(p => squash(p.name)));
  const completed = new Set();
  (sessions || []).forEach(s => {
    const key = squash(s.planName);
    if (names.has(key)) completed.add(key);
  });
  return completed;
}

// The level the client's tenure alone puts them at — see WEEKS_PER_LEVEL
// above. `now` is a real Date/timestamp in production, injected in tests
// for determinism.
function tenureLevel(sessions, now) {
  const dates = (sessions || []).map(s => s.date).filter(Boolean).sort();
  if (dates.length === 0) return 'beginner';
  const firstDate = new Date(`${dates[0]}T00:00:00`);
  const nowMs = now instanceof Date ? now.getTime() : now;
  const weeksActive = Math.max(0, (nowMs - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
  if (weeksActive >= WEEKS_PER_LEVEL * 2) return 'advanced';
  if (weeksActive >= WEEKS_PER_LEVEL) return 'intermediate';
  return 'beginner';
}

// Which level a client is currently on, within one category (Gym or Home).
// Two rules, in order:
//   1. The tenure clock above — the primary gate. Time alone advances a
//      level; completing every program in it isn't required.
//   2. Never suggest a level LOWER than the highest level the client has any
//      completed session in at all — covers a client who jumped straight
//      into Intermediate/Advanced (e.g. coach-assigned) early in their
//      tenure; rule 1 alone would keep nudging them toward Beginner until
//      the clock caught up, even though they're demonstrably past it.
function determineLevel(programsByLevel, sessions, now) {
  let level = tenureLevel(sessions, now);

  LEVELS.forEach(lvl => {
    if (completedProgramNames(programsByLevel[lvl], sessions).size > 0 && LEVELS.indexOf(lvl) > LEVELS.indexOf(level)) {
      level = lvl;
    }
  });

  return level;
}

// Every session (across ALL levels' programs) in one category, and the most
// recent date among them — used only to decide which category to lead with
// when a client has history in both.
function categoryActivity(programsByLevel, sessions) {
  const allNames = new Set();
  LEVELS.forEach(level => (programsByLevel[level] || []).forEach(p => allNames.add(squash(p.name))));
  let count = 0;
  let mostRecentDate = null;
  (sessions || []).forEach(s => {
    if (!allNames.has(squash(s.planName))) return;
    count += 1;
    if (!mostRecentDate || s.date > mostRecentDate) mostRecentDate = s.date;
  });
  return { count, mostRecentDate };
}

/**
 * Full Beginner -> Intermediate -> Advanced, Gym-and-Home-aware guidance.
 *
 * @param {object} library - `{ gym: { beginner, intermediate, advanced }, home: { beginner, intermediate, advanced } }`,
 *   each a Workout Library programs array (possibly empty).
 * @param {Array<{date: string, planName: string}>} sessions - the client's
 *   logged sessions, any order.
 * @param {Date|number} [now] - defaults to the real current time; pass a
 *   fixed Date/timestamp in tests for deterministic tenure calculations.
 * @returns {{ category: 'gym'|'home', level: 'beginner'|'intermediate'|'advanced',
 *   program: object, reason: 'no-sessions'|'no-beginner-session'|'leveled-up'|'rotation',
 *   lastProgram: object|null } | null} `program` is what to suggest next.
 *   Null only when neither category has any programs configured at all.
 *   `reason`:
 *     - 'no-sessions': the client has never logged anything, anywhere.
 *     - 'no-beginner-session': still on Beginner, hasn't logged one of its
 *       named programs yet (may have other, unrelated sessions).
 *     - 'leveled-up': this is the first suggestion since the tenure clock
 *       (or the never-go-backward floor) moved the client to a level above
 *       Beginner — they haven't logged anything at this new level yet.
 *     - 'rotation': suggest the next program after their most recent match
 *       at this level, wrapping back to the first after the last (this is
 *       also the steady state once Advanced's 3 months are reached too).
 */
export function determineWorkoutGuidance(library, sessions, now = Date.now()) {
  const safeLib = {
    gym: library?.gym || {},
    home: library?.home || {}
  };
  const hasAnyProgram = CATEGORIES.some(cat => LEVELS.some(lvl => (safeLib[cat][lvl] || []).length > 0));
  if (!hasAnyProgram) return null;

  const safeSessions = Array.isArray(sessions) ? sessions : [];

  // Pick which category to lead with: whichever the client has actually been
  // doing (more matched sessions; ties broken by the more recent one).
  // Defaults to 'gym' when neither category has any matching history —
  // matches the original Beginner-only banner's default.
  let category = 'gym';
  if (safeSessions.length > 0) {
    const activity = { gym: categoryActivity(safeLib.gym, safeSessions), home: categoryActivity(safeLib.home, safeSessions) };
    if (activity.home.count > activity.gym.count) category = 'home';
    else if (activity.home.count === activity.gym.count && activity.home.count > 0
      && activity.home.mostRecentDate > activity.gym.mostRecentDate) category = 'home';
  }

  const programsByLevel = safeLib[category];
  const level = determineLevel(programsByLevel, safeSessions, now);
  const programs = programsByLevel[level] || [];
  if (programs.length === 0) return null; // this category has no programs at the level it resolved to

  const pick = pickNextProgramInRotation(programs, safeSessions);
  if (!pick) return null;

  let reason = pick.reason;
  if (reason === 'no-beginner-session' && level !== 'beginner') reason = 'leveled-up';

  return { category, level, program: pick.program, reason, lastProgram: pick.lastProgram };
}
