// One exercise logged, planned or searched under slightly different spellings
// ("Face Pull" / "Face Pulls", "Pull-up" / "Pull‑Ups" with a non-breaking
// hyphen, "Lat Pull Down" / "Lat pull-down") is still one exercise. Every
// lookup that ties a plan/log entry back to its library record or its own
// history (PREV, Form Guide video, exercise history, the Add Exercise
// search) compares these keys instead of the raw names, so a spelling
// variant still finds the video and last session's sets.
//
// The key drops case, punctuation and spacing (the same squash the Form
// Guide match already did) and a plural "s" at the end of each word.
// "ss"/"us"/"is" endings are words, not plurals (Press, Bus, Pelvis).

const UNICODE_DASHES = /[‐-―−­]/g;

export const foldExerciseDashes = (name) => String(name || '').replace(UNICODE_DASHES, '-');

const singular = (word) => (word.length >= 3 && /[^sui]s$/.test(word) ? word.slice(0, -1) : word);

export function exerciseNameKey(name) {
  return foldExerciseDashes(name)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singular)
    .join('');
}

export const sameExercise = (a, b) => {
  const key = exerciseNameKey(a);
  return key !== '' && key === exerciseNameKey(b);
};

// The library's own spelling of `name` when one matches by key, else `name`
// with any unicode dashes folded to "-". Used where an outside source (the AI
// draft builder) names exercises, so the saved plan uses the library's name.
export function canonicalExerciseName(name, libraryNames) {
  const trimmed = foldExerciseDashes(name).trim();
  const key = exerciseNameKey(trimmed);
  if (!key) return trimmed;
  const lower = trimmed.toLowerCase();
  const names = libraryNames || [];
  return names.find(n => (n || '').toLowerCase() === lower)
    || names.find(n => exerciseNameKey(n) === key)
    || trimmed;
}

// ── Library ids ──────────────────────────────────────────────────────────
// Plan/template/draft entries carry `exerciseId` and workout_logs rows
// `exercise_id`: the uuid of the library record the exercise was picked
// from — a public.exercises row or the coach's/client's custom_exercises
// row (both uuid keyed, so the id alone says which). See
// sql/supabase_exercise_id_linkage.sql. The app's code-only library
// (EXERCISE_LIBRARY) has no table row, so its entries have no id and keep
// resolving by name.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A library record's id when it is a real table row, else null.
export const libraryExerciseId = (record) =>
  (record && UUID.test(String(record.id || '')) ? record.id : null);

// `{ exerciseId }` to spread into a plan/log entry, `{}` when there is none,
// so entries without an id keep exactly the shape they always had. Only a
// uuid counts — an add handler handed straight to forEach/onClick gets an
// index or an event as its second argument, never an id.
export const exerciseIdField = (exerciseId) =>
  (typeof exerciseId === 'string' && UUID.test(exerciseId) ? { exerciseId } : {});

// Is this planned/logged entry the same exercise as that one? Each side is a
// name or a `{ name, exerciseId }` entry. The same id always is (a library
// record renamed since the client logged it still finds its history);
// otherwise the name keys decide, exactly as before ids existed — two ids
// that differ don't overrule a matching name (a client's custom "Face
// Pulls" and the catalog's "Face Pull" are one exercise to them).
export function sameExerciseEntry(a, b) {
  const idA = typeof a === 'object' && a ? a.exerciseId : null;
  const idB = typeof b === 'object' && b ? b.exerciseId : null;
  if (idA && idB && idA === idB) return true;
  const nameA = typeof a === 'object' && a ? a.name : a;
  const nameB = typeof b === 'object' && b ? b.name : b;
  return sameExercise(nameA, nameB);
}

// The library record `name` refers to: same spelling (any case) first,
// then the same name key. null when nothing matches.
export function findLibraryExercise(name, library) {
  const key = exerciseNameKey(name);
  if (!key) return null;
  const lower = foldExerciseDashes(name).trim().toLowerCase();
  const records = library || [];
  return records.find(r => (r.name || '').trim().toLowerCase() === lower)
    || records.find(r => exerciseNameKey(r.name) === key)
    || null;
}

// Gives every entry without an `exerciseId` the id of its library record,
// when one matches by name. The save-time safety net for exercises that
// reached a plan/draft/log without passing through the picker (library
// programs, leftovers, older drafts). Returns the same array when nothing
// changed.
export function withExerciseIds(exercises, library) {
  if (!Array.isArray(exercises) || !library || library.length === 0) return exercises;
  let changed = false;
  const next = exercises.map(ex => {
    if (!ex || typeof ex !== 'object' || ex.exerciseId || !ex.name) return ex;
    const id = libraryExerciseId(findLibraryExercise(ex.name, library));
    if (!id) return ex;
    changed = true;
    return { ...ex, exerciseId: id };
  });
  return changed ? next : exercises;
}
