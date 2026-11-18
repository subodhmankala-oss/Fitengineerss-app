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

// What goes over the wire to the server: name, muscle and the picker
// category — nothing else, so the request and prompt stay small.
export const catalogForPrompt = (catalog) =>
  (catalog || []).map(e => ({ name: e.name, muscle: e.muscle, ...(e.category ? { category: e.category } : {}) }));

// "Chest: Bench Press (Barbell); Cable Fly; ..." one line per group. Grouped
// by the picker category (about 10 tidy groups: Chest, Back, Legs …) rather
// than primary_muscle, which is free text in the DB (100+ spellings like
// "Back / Lats", "Latissimus Dorsi", "Lats, Teres Major") and split the list
// into dozens of one-name lines. An entry without a category — an older
// cached client sends none, and some custom exercises have none — is grouped
// by its muscle label instead.
export function formatCatalogForPrompt(catalog) {
  const groups = new Map();
  (catalog || []).forEach(e => {
    const m = e.category || e.muscle || 'Other';
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

// How good a stand-in `alt` is for `name`, 0–99 — the live Swap sheet's
// "96% match". The same primary muscle counts most (the same category a bit
// less), then the same equipment, then shared movement words ("Bench",
// "Press", "Row"), so Dumbbell Bench Press beats Chest Press Machine for
// Bench Press (Barbell). Never 100: a swap is never the exercise itself.
export function swapMatchPercent(name, alt, catalog) {
  const list = Array.isArray(catalog) ? catalog : [];
  const self = list.find(e => exerciseNameKey(e.name) === exerciseNameKey(name)) || matchCatalogExercise(name, list);
  const mine = words(name);
  const theirs = words(alt?.name || '');
  const myEquipment = new Set(mine.filter(w => EQUIPMENT.has(w)));
  const myMovement = new Set(mine.filter(w => !EQUIPMENT.has(w)));
  const theirMovement = new Set(theirs.filter(w => !EQUIPMENT.has(w)));
  let score = 35;
  if (self && alt?.muscle === self.muscle) score = 70;
  else if (self?.category && alt?.category === self.category) score = 50;
  if (theirs.some(w => myEquipment.has(w))) score += 12;
  const shared = [...theirMovement].filter(w => myMovement.has(w)).length;
  score += Math.round((17 * shared) / Math.max(myMovement.size, theirMovement.size, 1));
  return Math.min(99, score);
}

// The equipment an exercise name says it uses, for the Swap sheet's filter
// pills — null when the name doesn't say (the caller decides on
// "Bodyweight" from the library's own bodyweight list).
const EQUIPMENT_LABELS = [
  ['dumbbell', 'Dumbbell'], ['barbell', 'Barbell'], ['ez', 'Barbell'],
  ['smith', 'Machine'], ['machine', 'Machine'], ['cable', 'Cable'],
  ['kettlebell', 'Kettlebell'], ['band', 'Band'], ['resistance', 'Band']
];
export function equipmentLabel(name) {
  const w = new Set(words(name || ''));
  const hit = EQUIPMENT_LABELS.find(([word]) => w.has(word));
  return hit ? hit[1] : null;
}
