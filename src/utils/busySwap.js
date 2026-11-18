// "Busy?" line on a logger card: when the machine/cable station or the
// dumbbells for an exercise are taken, offer the closest stand-in that
// doesn't need them, in one tap. Same library and match % as the ≡ menu's Swap sheet
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

const isDumbbellExercise = (name) => equipmentLabel(name) === 'Dumbbell';

// Which exercises get a Busy? line.
export function isBusyEligible(name) {
  return isStationExercise(name) || isDumbbellExercise(name);
}

// A stand-in must not need the thing that's busy: no station for a station
// exercise, no dumbbells for a dumbbell one.
const freeOfSame = (name, alt) => (isStationExercise(name)
  ? !isStationExercise(alt)
  : !isDumbbellExercise(alt));

const MIN_MATCH = 60;

// → { name, exerciseId, match } or null. `excludeNames`: exercises already in
// today's workout, so it never suggests something they're about to do anyway.
export function busyAlternative(name, catalog, excludeNames = []) {
  if (!isBusyEligible(name) || !Array.isArray(catalog) || catalog.length === 0) return null;
  const best = swapAlternatives(name, catalog, { exclude: excludeNames, limit: 24 })
    .filter(e => !isSameExerciseName(name, e.name) && freeOfSame(name, e.name))
    .map(e => ({ e, match: swapMatchPercent(name, e, catalog) }))
    .filter(x => x.match >= MIN_MATCH)
    .sort((a, b) => b.match - a.match)[0];
  return best ? { name: best.e.name, exerciseId: libraryExerciseId(best.e), match: best.match } : null;
}
