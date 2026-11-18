// "Busy?" line on a logger card: whatever an exercise needs (machine, cable,
// dumbbells, a barbell) may be taken, so offer the closest stand-ins that
// don't need it, in one tap — on every exercise. Same library and match % as the ≡ menu's Swap sheet
// (swapAlternatives / swapMatchPercent), so the two never disagree.
import { equipmentLabel, isSameExerciseName, swapAlternatives, swapMatchPercent } from './aiWorkoutCatalog';
import { libraryExerciseId } from './exerciseName';

// Stations people queue for. The name says "Machine"/"Cable"/"Smith", or it's
// a machine by nature even when the name doesn't say so.
const MACHINE_BY_NATURE = /(leg press|hack squat|pec deck|pull ?down|leg curl|leg extension|seated row|high row|hip (ab|ad)duction|calf raise \(machine\)|seated leg curl|reverse fly machine|chest press)/i;

export function isStationExercise(name) {
  const equip = equipmentLabel(name);
  return equip === 'Machine' || equip === 'Cable' || MACHINE_BY_NATURE.test(String(name || ''));
}

// What the exercise needs that might be taken: a station (machine/cable),
// or a kind of free weight. Bodyweight and anything else needs nothing.
const needOf = (name) => {
  if (isStationExercise(name)) return 'station';
  const equip = equipmentLabel(name);
  return equip === 'Dumbbell' || equip === 'Barbell' || equip === 'Kettlebell' || equip === 'Band' ? equip : null;
};

// Every exercise card offers swaps.
export function isBusyEligible(name) {
  return !!String(name || '').trim();
}

// A stand-in must not need the thing that's busy: no station for a station
// exercise, no dumbbells for a dumbbell one, no barbell for a barbell one.
const freeOfSame = (name, alt) => {
  const need = needOf(name);
  return !need || needOf(alt) !== need;
};

const MIN_MATCH = 50;

// Bodyweight moves most people can't do yet: still offered, but after the
// rest, so "Lat Pull Down" doesn't lead with Pull-up. Assisted versions are
// easy and stay where they rank.
const HARD = /(pull-?up|chin-?up|muscle-?up|\bdips?\b|nordic|pistol|handstand|sternum)/i;
const isHard = (name) => HARD.test(name) && !/assisted/i.test(name);

// → up to `limit` of { name, exerciseId, match }, best first (hard moves
// last). `excludeNames`: exercises already in today's workout, so it never
// suggests something they're about to do anyway.
export function busyAlternatives(name, catalog, excludeNames = [], limit = 3) {
  if (!isBusyEligible(name) || !Array.isArray(catalog) || catalog.length === 0) return [];
  return swapAlternatives(name, catalog, { exclude: excludeNames, limit: 24 })
    .filter(e => !isSameExerciseName(name, e.name) && freeOfSame(name, e.name))
    .map(e => ({ e, match: swapMatchPercent(name, e, catalog) }))
    .filter(x => x.match >= MIN_MATCH)
    .sort((a, b) => (isHard(a.e.name) - isHard(b.e.name)) || (b.match - a.match))
    .slice(0, limit)
    .map(({ e, match }) => ({ name: e.name, exerciseId: libraryExerciseId(e), match }));
}

// Busy? swaps chain: the card always offers stand-ins for the exercise the
// plan started with (`busyBase`), skipping everything already tried
// (`busyTried`), up to MAX_BUSY_SWAPS in a row. A card swapped from the ≡
// menu (swappedFrom without busyBase) gets no Busy? line.
export const MAX_BUSY_SWAPS = 3;

export function nextBusyOption(entry, catalog, workoutNames = []) {
  if (!entry || (entry.sets || []).some(s => s.isCompleted)) return null;
  const base = entry.busyBase || (entry.swappedFrom ? null : entry.name);
  if (!base) return null;
  const tried = entry.busyTried || [];
  if (tried.length >= MAX_BUSY_SWAPS) return null;
  const [next] = busyAlternatives(base, catalog, [...workoutNames, ...tried], 1);
  return next ? { ...next, base, tried: [...tried, next.name] } : null;
}
