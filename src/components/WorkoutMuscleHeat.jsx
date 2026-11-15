import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getWeeklyMuscleStats } from '../utils/muscleAnalytics';
import { HEAT_STEPS, heatColor } from '../utils/workoutHeat';
import { HeatBodyFigure } from './MuscleAnalytics/MuscleThumbnail';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './WorkoutMuscleHeat.css';

const fmtSets = (n) => `${Math.round(n * 10) / 10} set${n === 1 ? '' : 's'}`;

/**
 * Live muscle heat map for the logger's timer bar (client WorkoutTracker and
 * coach Live Log). Front + back figures light up as sets are ticked; tapping
 * opens a panel under the bar with bigger figures and sets per muscle.
 * `rows` = tickedSetRows(exercises, logDate) — the same rows the Muscles tab
 * counts, so warm-ups and empty ticked sets are left out the same way.
 * Must sit inside a positioned bar (both bars are position: sticky): the
 * panel drops down from the bar's bottom edge.
 */
export default function WorkoutMuscleHeat({ rows, logDate }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const hit = useMemo(() => (
    getWeeklyMuscleStats(rows || [], logDate, logDate)
      .filter(s => s.totalSets > 0)
      .sort((a, b) => b.totalSets - a.totalSets)
  ), [rows, logDate]);
  const setsBy = useMemo(() => Object.fromEntries(hit.map(s => [s.muscle, s.totalSets])), [hit]);
  const colorFor = (m) => heatColor(setsBy[m] || 0);
  const pulseKey = (m) => setsBy[m] || 0;

  // A tap anywhere outside closes the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const max = Math.max(4, ...hit.map(s => s.totalSets));
  const label = hit.length
    ? `Muscles worked this workout: ${hit.map(s => s.muscle).join(', ')}`
    : 'Muscles worked this workout: none yet';

  return (
    <div className="wmh" ref={rootRef}>
      <button
        type="button"
        className={`wmh-toggle${open ? ' is-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={label}
        title="Muscles worked this workout"
      >
        <HeatBodyFigure view="front" height={40} colorFor={colorFor} pulseKey={pulseKey} />
        <HeatBodyFigure view="back" height={40} colorFor={colorFor} pulseKey={pulseKey} />
        <svg className="wmh-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="wmh-panel" role="dialog" aria-label="Muscles worked this workout">
          <div className="wmh-panel-body">
            <div className="wmh-figs">
              <div><HeatBodyFigure view="front" height={150} colorFor={colorFor} /><span>Front</span></div>
              <div><HeatBodyFigure view="back" height={150} colorFor={colorFor} /><span>Back</span></div>
            </div>
            <div className="wmh-list">
              {hit.length === 0 ? (
                <p className="wmh-empty">Tick a set and the muscles it works light up here.</p>
              ) : hit.slice(0, 7).map(s => (
                <div className="wmh-row" key={s.muscle}>
                  <span className="wmh-swatch" style={{ background: heatColor(s.totalSets) }} />
                  <span className="wmh-name">{s.muscle}</span>
                  <span className="wmh-sets">{fmtSets(s.totalSets)}</span>
                  <span className="wmh-bar"><i style={{ width: `${(s.totalSets / max) * 100}%`, background: heatColor(s.totalSets) }} /></span>
                </div>
              ))}
            </div>
          </div>
          <div className="wmh-legend">
            <span>This workout</span>
            {[...HEAT_STEPS].reverse().map(s => <i key={s.color} style={{ background: s.color }} />)}
            <span>more sets</span>
          </div>
        </div>
      )}
    </div>
  );
}
