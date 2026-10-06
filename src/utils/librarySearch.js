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

// ─── Duration / equipment chips ───────────────────────────────────────────
// Library programs carry no duration or equipment tags, so both are derived:
// duration from planCardMeta's estMinutes, equipment from exercise names.

export const DURATION_FILTERS = [
  { id: 'short', label: '≤ 30 min', test: m => m <= 30 },
  { id: 'medium', label: '30–45 min', test: m => m > 30 && m <= 45 },
  { id: 'long', label: '45–60 min', test: m => m > 45 && m <= 60 },
  { id: 'xl', label: '60+ min', test: m => m > 60 },
];

export const EQUIPMENT_FILTERS = [
  { id: 'none', label: 'No equipment' },
  { id: 'dumbbell', label: 'Dumbbells' },
  { id: 'barbell', label: 'Barbell' },
  { id: 'machine', label: 'Machines & cables' },
];

const EQUIPMENT_PATTERNS = {
  dumbbell: /dumbbell|\bdb\b|kettlebell/,
  barbell: /barbell|\bbb\b|smith|\bez\b|bench press|deadlift|\bsquat\b.*barbell/,
  machine: /machine|cable|pulldown|pushdown|leg press|leg extension|leg curl|pec deck|seated row|lat pull|hack squat|assisted/,
};

// Set of equipment ids a program's exercises call for. 'none' means nothing
// recognisable is needed (bodyweight).
export function getProgramEquipment(exercises) {
  const found = new Set();
  (exercises || []).forEach(ex => {
    const n = String(ex?.name || '').toLowerCase();
    Object.entries(EQUIPMENT_PATTERNS).forEach(([id, re]) => {
      // "Dumbbell Bench Press" is dumbbell work, not barbell.
      if (id === 'barbell' && EQUIPMENT_PATTERNS.dumbbell.test(n)) return;
      if (re.test(n)) found.add(id);
    });
  });
  // Nothing recognisable needed -> bodyweight / no-equipment program.
  if (!found.size) found.add('none');
  return found;
}

// entries carry estMinutes + equipment (Set). Empty filter = no restriction.
export function filterByChips(entries, { duration, equipment } = {}) {
  const d = DURATION_FILTERS.find(f => f.id === duration);
  return entries.filter(e =>
    (!d || d.test(e.estMinutes)) &&
    (!equipment || e.equipment?.has(equipment))
  );
}
