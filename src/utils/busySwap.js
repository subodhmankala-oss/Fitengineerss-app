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
