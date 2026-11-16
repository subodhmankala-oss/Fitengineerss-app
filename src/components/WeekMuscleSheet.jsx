import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BodyDiagram } from './MuscleAnalytics/MuscleHeatMap';
import MuscleThumbnail from './MuscleAnalytics/MuscleThumbnail';
import { getWeeklyMuscleStats, isCountableSet } from '../utils/muscleAnalytics';
import { MUSCLE_GROUPS } from '../utils/muscleGroups';
import { getRegionBreakdownForMuscle, hasRegions } from '../utils/muscleRegions';
import { weekRangeFor } from '../utils/setMuscleRing';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './WeekMuscleSheet.css';

// "This week's muscles": slides up when the body figures in the logger's
// timer bar are tapped (client logger and coach Live Log), so the home
// screen's Muscle Balance can be checked without leaving the workout.
// Counts the saved week plus the sets ticked in the session in progress,
// with the home screen's own counting (getWeeklyMuscleStats), so the two
// always agree. Under the body: one card per muscle this workout has worked,
// showing exactly what its home Muscle Balance card shows (status, sets /
// target, %), plus what today added and — for muscles with parts (Chest,
// Back, Shoulders…) — the parts today's sets went to, e.g. "Mid Chest 4 / 4".

const fmt = n => String(Math.round((n || 0) * 10) / 10);
const EPS = 0.001;

export default function WeekMuscleSheet({ open, onClose, savedLogs, liveRows, logDate, level }) {
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
    const bySaved = Object.fromEntries(
      getWeeklyMuscleStats(saved, start, end, { includeUntrained: true, level }).map(s => [s.muscle, s])
    );
    const byAll = Object.fromEntries(statsAll.map(s => [s.muscle, s]));
    const regionSplit = Object.fromEntries(MUSCLE_GROUPS.filter(hasRegions).map(m => {
      const parts = getRegionBreakdownForMuscle(all, m, start, end, { level }).filter(r => r.tier);
      return [m, Object.fromEntries(parts.map(r => [r.id, r.tier]))];
    }));
    const todaySets = (liveRows || []).filter(r => isCountableSet(r)).length;

    const cards = statsAll
      .map(s => ({ stat: s, today: s.totalSets - (bySaved[s.muscle]?.totalSets || 0) }))
      .filter(c => c.today > EPS)
      .sort((a, b) => b.today - a.today)
      .map(c => {
        if (!hasRegions(c.stat.muscle)) return { ...c, parts: [] };
        const before = Object.fromEntries(
          getRegionBreakdownForMuscle(saved, c.stat.muscle, start, end, { level }).map(r => [r.id, r.sets])
        );
        const parts = getRegionBreakdownForMuscle(all, c.stat.muscle, start, end, { level })
          .filter(r => r.band && r.sets - (before[r.id] || 0) > EPS)
          .map(r => ({ id: r.id, sets: r.sets, min: r.band.min }));
        return { ...c, parts };
      });
    return { byAll, regionSplit, todaySets, cards };
  }, [open, logDate, savedLogs, liveRows, level]);

  if (!open || !data) return null;
  const { byAll, regionSplit, todaySets, cards } = data;

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

        {cards.length === 0 ? (
          <p className="wms-empty">Tick a set and the muscles it works show up here, the same as your home cards.</p>
        ) : (
          <>
            <p className="wms-caption">Muscles in this workout · same as your home cards</p>
            {cards.map(({ stat, today, parts }) => {
              // Bar on the home card's scale (sets / target): the week before
              // today solid, today's sets striped on top, a green tick where
              // Optimal starts (the band's low end).
              const pctOf = n => Math.min(100, Math.max(0, (n / stat.target) * 100));
              const beforePct = pctOf(stat.sets - today);
              const todayPct = pctOf(stat.sets) - beforePct;
              const goal = stat.sets < stat.min
                ? `${fmt(stat.min - stat.sets)} more to Optimal`
                : stat.sets <= stat.max ? 'In the Optimal range' : 'Past the useful range';
              return (
                <div key={stat.muscle} className={`wms-card status-${stat.status.color}`}>
                  <div className="wms-card-top">
                    <span className="wms-thumb">
                      <MuscleThumbnail muscle={stat.muscle} color="var(--status-color)" size={36} />
                    </span>
                    <div className="wms-card-title">
                      <div className="wms-card-line">
                        <strong>{stat.muscle}</strong>
                        <span className="wms-pct">{stat.completionPercent}<small>%</small></span>
                      </div>
                      <div className="wms-card-line">
                        <span className="wms-pill">{stat.status.label}</span>
                        <span className="wms-sets">{fmt(stat.sets)} / {stat.target} sets</span>
                      </div>
                    </div>
                  </div>
                  <div className="wms-track" role="img" aria-label={`${fmt(stat.sets)} of ${stat.target} sets, ${fmt(today)} today`}>
                    <span className="wms-fill" style={{ width: `${beforePct}%` }} />
                    <span className="wms-fill wms-fill--today" style={{ left: `${beforePct}%`, width: `${todayPct}%` }} />
                    <span className="wms-optimal" style={{ left: `${pctOf(stat.min)}%` }} />
                  </div>
                  <div className="wms-card-foot">
                    <span className="wms-up">↗ +{fmt(today)} today</span>
                    {parts.map(p => (
                      <span key={p.id} className={`wms-chip${p.sets >= p.min ? ' is-done' : ''}`}>
                        {p.sets >= p.min ? '✓ ' : ''}{p.id} {fmt(p.sets)}/{p.min}
                      </span>
                    ))}
                    <span className="wms-goal">{goal}</span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
