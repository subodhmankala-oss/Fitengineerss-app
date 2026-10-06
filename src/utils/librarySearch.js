// Workout Library search: matches a query against program name, exercise
// names and trained muscles across every category x level at once, so a
// client can type "chest" or "dumbell" without knowing where it lives.

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Small synonym map so gym vocabulary lands on the names the library uses.
const SYNONYMS = {
  abs: ['core', 'abdominal', 'abdominals'],
  core: ['abs'],
  pecs: ['chest'],
  chest: ['pecs', 'pec'],
  lats: ['back'],
  delts: ['shoulder', 'shoulders'],
  legs: ['quads', 'hamstrings', 'glutes', 'squat'],
  arms: ['biceps', 'triceps'],
  bis: ['biceps'],
  tris: ['triceps'],
  glutes: ['butt', 'hips'],
  cardio: ['hiit', 'conditioning'],
};

// True when a is within one edit (insert/delete/replace/transpose) of b.
// Cheap typo tolerance, only applied to tokens of 4+ characters.
function withinOneEdit(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (i === la || i === lb) return true; // one is a prefix of the other
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // replace
    if (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) return true; // swap
    return false;
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

function tokenMatches(token, haystack, words) {
  if (haystack.includes(token)) return true;
  if (token.length >= 4 && words.some(w => withinOneEdit(token, w))) return true;
  return false;
}

// Every query token must match (AND), via substring, synonym or a typo.
export function matchesLibraryQuery(query, ...fields) {
  const tokens = norm(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const haystack = norm(fields.flat().join(' '));
  const words = haystack.split(' ');
  return tokens.every(t =>
    tokenMatches(t, haystack, words) ||
    (SYNONYMS[t] || []).some(s => haystack.includes(s))
  );
}

// entries: [{ category, level, workout, muscles }] -> filtered entries.
export function searchLibrary(entries, query) {
  if (!norm(query)) return entries;
  return entries.filter(({ workout, muscles, category, level }) =>
    matchesLibraryQuery(
      query,
      workout?.name,
      (workout?.exercises || []).map(e => e?.name),
      muscles || [],
      category,
      level
    )
  );
}
