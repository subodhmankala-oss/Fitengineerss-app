// Lookup for the exercise safety tags (src/data/exerciseTags.js) and the
// "untagged" rule for exercises that have none (coach custom exercises, new
// catalog rows). Plain functions — shared by the browser and the api/
// function, like aiWorkoutCatalog.js.

import { EXERCISE_TAGS } from '../data/exerciseTags.js';
import { UNTAGGED } from '../data/aiProgrammingRules.js';
import { exerciseNameKey } from './exerciseName.js';

const TAGS_BY_KEY = new Map(
  EXERCISE_TAGS.map(([name, impact, difficulty, joints, equipment, note]) => [
    exerciseNameKey(name),
    { name, impact, difficulty, joints, equipment, ...(note ? { note } : {}) }
  ])
);

// The tags for `name` (any spelling variant), or null when it is untagged.
export const getExerciseTags = (name) => TAGS_BY_KEY.get(exerciseNameKey(name)) || null;

export const isTagged = (name) => getExerciseTags(name) !== null;

// Untagged exercises are never excluded automatically. They are flagged to
// the coach when the client has an injury or any impact cap applies.
// Returns one warning per untagged name (deduped, in input order), or [] when
// neither condition holds.
export function untaggedWarnings(names, { hasInjury = false, hasImpactCap = false } = {}) {
  const flag = (UNTAGGED.flagWhen.injury && hasInjury) || (UNTAGGED.flagWhen.impactCap && hasImpactCap);
  if (!flag) return [];
  const seen = new Set();
  const out = [];
  for (const name of names || []) {
    const key = exerciseNameKey(name);
    if (!key || seen.has(key) || TAGS_BY_KEY.has(key)) continue;
    seen.add(key);
    out.push({ name, warning: UNTAGGED.coachWarning.replace('{name}', name) });
  }
  return out;
}
