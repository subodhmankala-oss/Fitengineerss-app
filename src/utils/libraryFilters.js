import { getPlanCardMeta } from './planCardMeta';

// Workout Library Focus / Time / Equipment filters. Library programs carry
// no such tags, so all three are derived: focus and duration from
// planCardMeta (category, estMinutes), equipment from exercise names.

export const FOCUS_FILTERS = ['Push', 'Pull', 'Legs', 'Core'].map(id => ({ id, label: id }));

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
  if (!found.size) found.add('none');
  return found;
}

// Library row -> the shape filterByChips reads.
export function enrichLibraryEntry(workout, category, level) {
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
  const meta = getPlanCardMeta({ exercises, planName: workout?.name });
  return { workout, category, level, estMinutes: meta.estMinutes, focus: meta.category, equipment: getProgramEquipment(exercises) };
}

// Empty filter = no restriction.
export function filterByChips(entries, { duration, equipment, focus } = {}) {
  const d = DURATION_FILTERS.find(f => f.id === duration);
  return entries.filter(e =>
    (!d || d.test(e.estMinutes)) &&
    (!equipment || e.equipment?.has(equipment)) &&
    (!focus || e.focus === focus)
  );
}

// Midpoint of each duration bucket, for "how close is this program's time".
const DURATION_TARGET = { short: 25, medium: 38, long: 53, xl: 70 };

// Never-empty version of filterByChips: exact matches when there are any,
// otherwise every entry ranked by how many picks it satisfies (time distance
// breaks ties), flagged closest:true so the UI can say so.
export function filterOrClosest(entries, filters = {}) {
  const exact = filterByChips(entries, filters);
  if (exact.length || !entries.length) return { results: exact, closest: false };
  const { duration, equipment, focus } = filters;
  const d = DURATION_FILTERS.find(f => f.id === duration);
  const score = e =>
    (d && d.test(e.estMinutes) ? 1 : 0) +
    (equipment && e.equipment?.has(equipment) ? 1 : 0) +
    (focus && e.focus === focus ? 1 : 0);
  const timeGap = e => (duration ? Math.abs(e.estMinutes - DURATION_TARGET[duration]) : 0);
  const results = entries
    .map((e, i) => ({ e, i, s: score(e), g: timeGap(e) }))
    .sort((a, b) => b.s - a.s || a.g - b.g || a.i - b.i)
    .map(x => x.e);
  return { results, closest: true };
}
