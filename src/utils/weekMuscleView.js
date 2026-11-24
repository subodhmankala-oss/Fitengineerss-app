// The week's muscle picture shared by the logger's timer-bar figures and the
// "This week's muscles" sheet, so the two always paint the same colours:
// each muscle's weekly status (getWeeklyMuscleStats → getHeatMapTier), and
// for muscles with parts (Chest, Shoulders, Quads…) each part's own tier.
import { getWeeklyMuscleStats } from './muscleAnalytics';
import { MUSCLE_GROUPS } from './muscleGroups';
import { getRegionBreakdownForMuscle, hasRegions } from './muscleRegions';
import { weekRangeFor } from './setMuscleRing';

/**
 * @param savedLogs saved set rows, liveRows the ticked sets of this workout
 * @returns {{start, end, all, statsAll, byAll, regionSplit}|null}
 *   byAll: muscle → weekly stat; regionSplit: muscle → { part → tier }
 */
export function getWeekMuscleView(savedLogs, liveRows, logDate, level) {
  if (!logDate) return null;
  const [start, end] = weekRangeFor(logDate);
  const all = [...(savedLogs || []), ...(liveRows || [])];
  // Everything here is about this week; `all` keeps the whole history for the
  // sheet's "last trained" line.
  const week = all.filter(l => l.log_date >= start && l.log_date <= end);
  const statsAll = getWeeklyMuscleStats(week, start, end, { includeUntrained: true, level });
  const byAll = Object.fromEntries(statsAll.map(s => [s.muscle, s]));
  const regionSplit = Object.fromEntries(MUSCLE_GROUPS.filter(hasRegions).map(m => {
    const parts = getRegionBreakdownForMuscle(week, m, start, end, { level }).filter(r => r.tier);
    return [m, Object.fromEntries(parts.map(r => [r.id, r.tier]))];
  }));
  return { start, end, all, statsAll, byAll, regionSplit };
}
