// ─── MUSCLE REGION BREAKDOWN ───
// The muscle detail screen's "what part of it did you train" section. A
// muscle group like Back is several distinct muscles (lats, traps, rhomboids,
// rotator cuff, erectors); this splits the group's sets into those regions
// using the same name-driven sub-groups as the Add Exercise picker
// (src/data/exerciseSubgroups.js), so the two screens always agree.
//
// Kept out of muscleAnalytics.js on purpose: that module is also imported by
// api/push.js under plain Node ESM, and exerciseSubgroups.js uses
// extensionless imports Node can't resolve.

import { EXERCISE_SUBGROUPS } from '../data/exerciseSubgroups';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';
import { getMuscleGroupsForExercise } from './muscleGroups';
import { isCountableSet, RECOMMENDED_EXERCISES, MUSCLE_TARGETS, classifyStatus, getHeatMapTier } from './muscleAnalytics';

// Muscle groups whose regions are worth showing. The picker's category keys
// that name a single heat-map muscle.
const REGIONS_BY_MUSCLE = {
  Back: EXERCISE_SUBGROUPS.Back,
  Chest: EXERCISE_SUBGROUPS.Chest,
  Shoulders: EXERCISE_SUBGROUPS.Shoulders,
};

export function hasRegions(muscle) {
  return Boolean(REGIONS_BY_MUSCLE[muscle]);
}

// First matching region, in the sub-group list's order. An exercise that fits
// two regions (Face Pull: upper + mid back) is counted once, in the first.
function regionOf(muscle, name) {
  const n = String(name || '').toLowerCase();
  const hit = (REGIONS_BY_MUSCLE[muscle] || []).find(r => r.test(n));
  return hit ? hit.id : null;
}

// A region's weekly band is its share of the whole muscle's band, split
// evenly across the regions (Back 12–20 over 5 regions → 2–4 sets each).
// Hitting every region's band therefore lands the whole muscle in range.
export function regionBand(muscle) {
  const regions = REGIONS_BY_MUSCLE[muscle];
  const band = MUSCLE_TARGETS[muscle];
  if (!regions || !band) return null;
  const n = regions.length;
  const min = Math.max(1, Math.round(band.min / n));
  const max = Math.max(min + 1, Math.round(band.max / n));
  return { min, max, target: Math.round((min + max) / 2) };
}

/**
 * Splits `muscle`'s working sets in [startStr, endStr] by region.
 * @returns {Array<{id, hint, sets, band, tier, exercises: Array<{name, sets}>, suggestions: string[]}>}
 *   one row per region (0-set regions included), plus an "Other" row only if
 *   some sets matched no region. `tier` is the heat map's Not Trained/Low/
 *   Optimal/High/Very High for the region against `band` (null for Other).
 */
export function getRegionBreakdownForMuscle(logs, muscle, startStr, endStr) {
  const regions = REGIONS_BY_MUSCLE[muscle];
  if (!regions) return [];

  const rows = new Map(regions.map(r => [r.id, { id: r.id, hint: r.hint, sets: 0, byExercise: {} }]));
  (logs || []).forEach(log => {
    if (!isCountableSet(log)) return;
    if (log.log_date < startStr || log.log_date > endStr) return;
    if (!getMuscleGroupsForExercise(log.exercise_name).includes(muscle)) return;
    const id = regionOf(muscle, log.exercise_name) || 'Other';
    if (!rows.has(id)) rows.set(id, { id, hint: 'Exercises that don\'t fit one region', sets: 0, byExercise: {} });
    const row = rows.get(id);
    row.sets += 1;
    row.byExercise[log.exercise_name] = (row.byExercise[log.exercise_name] || 0) + 1;
  });

  // Suggestions: the muscle's own recommended list first, then the library,
  // keeping only exercises that land in this region AND credit this muscle.
  const candidates = [...(RECOMMENDED_EXERCISES[muscle] || []), ...EXERCISE_LIBRARY.map(e => e.name)];
  const suggestionsFor = id => {
    const out = [];
    for (const name of candidates) {
      if (out.length >= 3) break;
      if (out.includes(name)) continue;
      if (regionOf(muscle, name) !== id) continue;
      if (!getMuscleGroupsForExercise(name).includes(muscle)) continue;
      out.push(name);
    }
    return out;
  };

  const band = regionBand(muscle);
  const tierFor = sets => getHeatMapTier({
    status: classifyStatus(sets, band),
    completionPercent: Math.round((sets / band.target) * 100),
  });

  return [...rows.values()].map(({ byExercise, ...row }) => ({
    ...row,
    band: row.id === 'Other' ? null : band,
    tier: row.id === 'Other' ? null : tierFor(row.sets),
    exercises: Object.entries(byExercise).map(([name, sets]) => ({ name, sets })).sort((a, b) => b.sets - a.sets),
    suggestions: row.id === 'Other' ? [] : suggestionsFor(row.id),
  }));
}
