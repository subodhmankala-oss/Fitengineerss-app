// Picks which Beginner Workout Library program to recommend next on the
// client's Home screen — a simple round-robin through the Beginner
// programs (in the order the library returns them, i.e. created_at asc),
// based on which one they most recently logged. Deliberately independent
// of the coaching "Training Level" tenure system (weeks-since-first-
// session) — that's a separate, bigger piece of work; this only looks at
// which Beginner-named workout was logged last.

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
  if (!Array.isArray(beginnerPrograms) || beginnerPrograms.length === 0) return null;

  if (!Array.isArray(sessions) || sessions.length === 0) {
    return { program: beginnerPrograms[0], reason: 'no-sessions', lastProgram: null };
  }

  const byName = new Map(beginnerPrograms.map((p, i) => [squash(p.name), i]));

  // Most recent session (by date) that matches a named Beginner program.
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const lastMatch = sorted.find(s => byName.has(squash(s.planName)));

  if (!lastMatch) {
    return { program: beginnerPrograms[0], reason: 'no-beginner-session', lastProgram: null };
  }

  const lastIndex = byName.get(squash(lastMatch.planName));
  const nextIndex = (lastIndex + 1) % beginnerPrograms.length;
  return { program: beginnerPrograms[nextIndex], reason: 'rotation', lastProgram: beginnerPrograms[lastIndex] };
}
