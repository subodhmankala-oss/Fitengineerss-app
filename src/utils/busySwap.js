// "Busy?" line on a logger card: when the machine or cable station for an
// exercise is taken, offer the closest free-weight / bodyweight stand-in in
// one tap. Same library and match % as the ≡ menu's Swap sheet
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

const MIN_MATCH = 60;

// → { name, exerciseId, match } or null. `excludeNames`: exercises already in
// today's workout, so it never suggests something they're about to do anyway.
export function busyAlternative(name, catalog, excludeNames = []) {
  if (!isStationExercise(name) || !Array.isArray(catalog) || catalog.length === 0) return null;
  const best = swapAlternatives(name, catalog, { exclude: excludeNames, limit: 24 })
    .filter(e => !isSameExerciseName(name, e.name) && !isStationExercise(e.name))
    .map(e => ({ e, match: swapMatchPercent(name, e, catalog) }))
    .filter(x => x.match >= MIN_MATCH)
    .sort((a, b) => b.match - a.match)[0];
  return best ? { name: best.e.name, exerciseId: libraryExerciseId(best.e), match: best.match } : null;
}
