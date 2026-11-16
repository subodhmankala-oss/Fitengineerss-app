import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BodyDiagram } from './MuscleAnalytics/MuscleHeatMap';
import { LEGEND } from './MuscleAnalytics/heatMapLegend';
import { getWeeklyMuscleStats, getMuscleTargets, isCountableSet, classifyStatus } from '../utils/muscleAnalytics';
import { getMuscleGroupsForExercise, MUSCLE_GROUPS } from '../utils/muscleGroups';
import { getRegionBreakdownForMuscle, hasRegions, regionBand, ringRegionOf } from '../utils/muscleRegions';
import { weekRangeFor, STATUS_COLORS, NOT_TRAINED } from '../utils/setMuscleRing';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './WeekMuscleSheet.css';

// "This week's muscles": slides up when the muscle drawing over a set
// table's ring column is tapped (client logger and coach Live Log), so the
// home screen's heat map can be checked without leaving the workout.
// Counts the saved week plus the sets ticked in the session in progress —
// the same counting as the home heat map (getWeeklyMuscleStats), so the two
// never disagree. Rows under the body: the exercise's main muscle (or the
// part the set rings count, e.g. Side Delts) with its week total and what
// this session added, then the other muscles it works with this session's
// share.

const fmt = n => String(Math.round((n || 0) * 10) / 10);

export default function WeekMuscleSheet({ open, onClose, exerciseName, savedLogs, liveRows, logDate, level }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const data = useMemo(() => {
    if (!open || !logDate) return null;
    const [start, end] = weekRangeFor(logDate);
    const saved = savedLogs || [];
    const all = [...saved, ...(liveRows || [])];
    const statsAll = getWeeklyMuscleStats(all, start, end, { includeUntrained: true, level });
    const statsSaved = getWeeklyMuscleStats(saved, start, end, { includeUntrained: true, level });
    const byAll = Object.fromEntries(statsAll.map(s => [s.muscle, s]));
    const bySaved = Object.fromEntries(statsSaved.map(s => [s.muscle, s]));
    const regionSplit = Object.fromEntries(MUSCLE_GROUPS.filter(hasRegions).map(m => {
      const parts = getRegionBreakdownForMuscle(all, m, start, end, { level }).filter(r => r.tier);
      return [m, Object.fromEntries(parts.map(r => [r.id, r.tier]))];
    }));
    const todaySets = (liveRows || []).filter(r => isCountableSet(r)).length;

    const muscles = getMuscleGroupsForExercise(exerciseName);
    let main = null;
    if (muscles.length) {
      const m = muscles[0];
      const region = ringRegionOf(m, exerciseName);
      const band = region ? regionBand(m, level) : getMuscleTargets(level)[m];
      const regionSets = logs => getRegionBreakdownForMuscle(logs, m, start, end, { level }).find(r => r.id === region)?.sets || 0;
      const week = region ? regionSets(all) : (byAll[m]?.totalSets || 0);
      const before = region ? regionSets(saved) : (bySaved[m]?.totalSets || 0);
      main = {
        label: region || m,
        week,
        target: band?.min ?? 1,
        today: week - before,
        color: band ? (STATUS_COLORS[classifyStatus(week, band).key] || NOT_TRAINED) : NOT_TRAINED,
      };
    }
    const others = muscles.slice(1).map(m => ({
      label: m,
      today: (byAll[m]?.totalSets || 0) - (bySaved[m]?.totalSets || 0),
    }));
    return { byAll, regionSplit, todaySets, main, others };
  }, [open, logDate, savedLogs, liveRows, level, exerciseName]);

  if (!open || !data) return null;
  const { byAll, regionSplit, todaySets, main, others } = data;

  return createPortal(
    <div className="wms-root" role="dialog" aria-modal="true" aria-label="This week's muscles">
      <div className="wms-backdrop" onClick={onClose} />
      <div className="wms-sheet">
        <button type="button" className="wms-grab" aria-label="Close" onClick={onClose}><span /></button>
        <div className="wms-head">
          <span className="wms-title">This week's muscles</span>
          <span className="wms-live">live · {todaySets} set{todaySets === 1 ? '' : 's'} today</span>
        </div>

        <div className="wms-bodies">
          {['front', 'back'].map(view => (
            <div key={view} className="wms-body">
              <BodyDiagram view={view} statByMuscle={byAll} onSelectMuscle={() => {}} regionSplit={regionSplit} />
              <span className="wms-view">{view === 'front' ? 'Front' : 'Back'}</span>
            </div>
          ))}
        </div>

        {main && (
          <div className="wms-main" style={{ '--wms-color': main.color }}>
            <span>{main.label} · this exercise</span>
            <span className="wms-main-num">
              {fmt(main.week)}/{main.target}
              {main.today > 0 && <span className="wms-up"> ↑{fmt(main.today)}</span>}
            </span>
          </div>
        )}
        {others.map(o => (
          <div key={o.label} className="wms-other">
            <span>{o.label}</span>
            <span>{o.today > 0 ? `+${fmt(o.today)} today` : '–'}</span>
          </div>
        ))}

        <div className="wms-legend">
          {LEGEND.map(l => (
            <span key={l.key}><span className="wms-dot" style={{ background: l.color }} />{l.label}</span>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
