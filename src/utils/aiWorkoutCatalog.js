// The AI Draft Builder's exercise catalog: the one list of exercises the
// model is allowed to pick from, and the matching that holds it to that list.
//
// The model used to name exercises freely and they were matched to the
// library only afterwards — every miss ("Cable Face Pull" vs the library's
// "Face Pull") reached the editor as a bare name with no Form Guide video and
// no PREV, and the coach had to find and swap each one by hand. Now the
// catalog goes into the prompt, and the server (api/generate-workout-draft.js)
// maps every returned name back onto it with matchCatalogExercise before the
// coach ever sees the draft. The Swap sheet in the plan editor uses
// swapAlternatives on the same list.
//
// Shared by the browser and the api/ function, so plain functions only.

import { exerciseNameKey, foldExerciseDashes } from './exerciseName.js';

// Exercises the program itself can't use as a working exercise — warm-ups
// are added by the coach (and library programs add their own), never chosen
// by the model.
const EXCLUDED_CATEGORIES = new Set(['Warm Up']);

// DB catalog rows first (they carry ids and videos), then the coach's own
// custom exercises, then code-only library entries not in the DB yet — the
// same precedence ExercisePickerModal's activeLibrary uses. `hidden` holds
// lowercased names the admin deleted or the picker hides.
export function buildAiCatalog({ dbExercises = [], customExercises = [], staticLibrary = [], hidden = new Set() } = {}) {
  const seen = new Set();
  const out = [];
  const add = (r) => {
    const name = foldExerciseDashes(r?.name || '').trim();
    const key = exerciseNameKey(name);
    if (!key || seen.has(key) || hidden.has(name.toLowerCase())) return;
    const category = r.category || '';
    if (EXCLUDED_CATEGORIES.has(category)) return;
    seen.add(key);
    out.push({
      name,
      muscle: r.primary_muscle || r.primary || category || 'Full Body',
      category,
      ...(r.id ? { id: r.id } : {})
    });
  };
  dbExercises.forEach(add);
  customExercises.forEach(add);
  staticLibrary.forEach(add);
  return out;
}

// What goes over the wire to the server: just name + muscle, so the prompt
// stays small (~230 exercises is ~4k tokens).
export const catalogForPrompt = (catalog) =>
  (catalog || []).map(e => ({ name: e.name, muscle: e.muscle }));

// "Chest: Bench Press (Barbell); Cable Fly; ..." one line per muscle group.
export function formatCatalogForPrompt(catalog) {
  const groups = new Map();
  (catalog || []).forEach(e => {
    const m = e.muscle || 'Other';
    if (!groups.has(m)) groups.set(m, []);
    groups.get(m).push(e.name);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, names]) => `${m}: ${names.join('; ')}`)
    .join('\n');
}

const words = (name) => foldExerciseDashes(name)
  .toLowerCase()
  .replace(/[()]/g, ' ')
  .split(/[^a-z0-9]+/)
  .filter(Boolean)
  .map(w => (w.length >= 3 && /[^sui]s$/.test(w) ? w.slice(0, -1) : w));

// Equipment words carry no movement meaning on their own — "Cable" alone
// should not make "Cable Fly" a match for "Cable Row".
const EQUIPMENT = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band', 'resistance', 'smith', 'bodyweight', 'weighted', 'ez', 'bar']);

// The catalog record `name` means, or null. Exact key first; then the
// closest name by shared movement words (at least one shared non-equipment
// word, and most of the shorter name's words present in the other).
export function matchCatalogExercise(name, catalog) {
  const key = exerciseNameKey(name);
  if (!key || !Array.isArray(catalog) || catalog.length === 0) return null;
  const exact = catalog.find(e => exerciseNameKey(e.name) === key);
  if (exact) return exact;

  const target = new Set(words(name));
  if (target.size === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const e of catalog) {
    const cand = new Set(words(e.name));
    let shared = 0;
    let sharedMovement = 0;
    cand.forEach(w => {
      if (target.has(w)) {
        shared += 1;
        if (!EQUIPMENT.has(w)) sharedMovement += 1;
      }
    });
    if (sharedMovement === 0) continue;
    const score = shared / Math.max(target.size, cand.size);
    const coverage = shared / Math.min(target.size, cand.size);
    if (coverage < 0.66) continue;
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

// Up to `limit` catalog exercises to offer in place of `name`: same primary
// muscle first, then the same category, never one already in `exclude`
// (names in the current day). Exercises sharing an equipment word with the
// original come first within each group, so a dumbbell move suggests other
// dumbbell moves before machines.
export function swapAlternatives(name, catalog, { exclude = [], limit = 8 } = {}) {
  const list = Array.isArray(catalog) ? catalog : [];
  const key = exerciseNameKey(name);
  const self = list.find(e => exerciseNameKey(e.name) === key) || matchCatalogExercise(name, list);
  const excluded = new Set([key, ...exclude.map(exerciseNameKey)]);
  const pool = list.filter(e => !excluded.has(exerciseNameKey(e.name)));
  const myEquipment = new Set(words(name).filter(w => EQUIPMENT.has(w)));
  const equipmentRank = (e) => (words(e.name).some(w => myEquipment.has(w)) ? 0 : 1);
  const byEquipment = (a, b) => equipmentRank(a) - equipmentRank(b) || a.name.localeCompare(b.name);

  const sameMuscle = self ? pool.filter(e => e.muscle === self.muscle).sort(byEquipment) : [];
  const sameCategory = self && self.category
    ? pool.filter(e => e.category === self.category && e.muscle !== self.muscle).sort(byEquipment)
    : [];
  return [...sameMuscle, ...sameCategory].slice(0, limit);
}
