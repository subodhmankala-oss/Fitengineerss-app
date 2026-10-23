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
