import React, { useCallback, useMemo, useState } from 'react';
import { getWeeklyMuscleStats } from '../utils/muscleAnalytics';
import { getHeatMapTier } from '../utils/muscleAnalytics';
import { getWeekMuscleView } from '../utils/weekMuscleView';
import { HeatBodyFigure } from './MuscleAnalytics/MuscleThumbnail';
import WeekMuscleSheet from './WeekMuscleSheet';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './WorkoutMuscleHeat.css';

/**
 * Live muscle heat map for the logger's timer bar (client WorkoutTracker and
 * coach Live Log). Front + back figures light up as sets are ticked, in the
 * same weekly-status colours as the sheet they open (blue Low, green
 * Optimal, orange High…), with a glow on the muscles a set just hit; tapping
 * slides up "This week's muscles" (WeekMuscleSheet): the week so far, with
 * the same numbers as the home Muscle Balance cards.
 * `rows` = tickedSetRows(exercises, logDate) — the same rows the Muscles tab
 * counts, so warm-ups and empty ticked sets are left out the same way.
 * `savedLogs` = the client's saved workout_logs rows, `level` their
 * training level — what the sheet needs to count the week like home does.
 * `workoutNames`, `laterNames`, `onAddExercise`, `onSaveForLater` drive the
 * sheet's next-part row (see WeekMuscleSheet).
 */
export default function WorkoutMuscleHeat({ rows, logDate, savedLogs, level, ...actions }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const hit = useMemo(() => (
    getWeeklyMuscleStats(rows || [], logDate, logDate)
      .filter(s => s.totalSets > 0)
      .sort((a, b) => b.totalSets - a.totalSets)
  ), [rows, logDate]);
  const setsBy = useMemo(() => Object.fromEntries(hit.map(s => [s.muscle, s.totalSets])), [hit]);
  // The figures wear the sheet's colours (the week's status per muscle and
  // part, saved + this workout), so the bar and the sheet it opens agree.
  const view = useMemo(() => getWeekMuscleView(savedLogs, rows, logDate, level), [savedLogs, rows, logDate, level]);
  const colorFor = (m) => {
    const stat = view?.byAll[m];
    const tier = stat ? getHeatMapTier(stat) : null;
    return tier && tier.key !== 'not_trained' ? tier.color : null;
  };
  const pulseKey = (m) => setsBy[m] || 0;

  const label = hit.length
    ? `Muscles worked this workout: ${hit.map(s => s.muscle).join(', ')}`
    : 'Muscles worked this workout: none yet';

  return (
    <div className="wmh">
      <button
        type="button"
        className={`wmh-toggle${open ? ' is-open' : ''}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={label}
        title="This week's muscles"
      >
        <HeatBodyFigure view="front" height={46} colorFor={colorFor} pulseKey={pulseKey} regionSplit={view?.regionSplit} />
        <HeatBodyFigure view="back" height={46} colorFor={colorFor} pulseKey={pulseKey} regionSplit={view?.regionSplit} />
      </button>
      <WeekMuscleSheet open={open} onClose={close} savedLogs={savedLogs} liveRows={rows} logDate={logDate} level={level} {...actions} />
    </div>
  );
}
