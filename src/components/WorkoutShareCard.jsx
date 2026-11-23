import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HeatBodyFigure } from './MuscleAnalytics/MuscleThumbnail';
import WorkoutShareLinkSheet from './WorkoutShareLinkSheet';
import { ShareIcon } from './TimerIcons';
import { HELPED_MUSCLE_COLOR, MAIN_MUSCLE_COLOR, musclesFromRows } from '../utils/workoutShare';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './WorkoutShareCard.css';

// Body drawings are 200 x 369; side by side they fit the card's width.
const BODY_RATIO = 369 / 200;
const bodyHeight = (width, height) => Math.max(120, Math.round(Math.min(height, (width / 2) * 0.98 * BODY_RATIO)));

const Icon = ({ size, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/**
 * Full-screen finish card, shown right after a client's own workout is saved
 * (see confirmSaveWorkout in WorkoutTracker.jsx): the muscles it trained lit
 * up front and back, its numbers, and one Share button (the read-only link).
 * The bodies take whatever height the rest leaves, so there is no empty band
 * above the buttons on any phone.
 */
const WorkoutShareCard = ({ session, onClose }) => {
  const { workoutName, dateLabel, calories, bestLift, totalSets, volume, rows, link } = session;
  const artRef = useRef(null);
  const [size, setSize] = useState(() => ({ width: Math.min(window.innerWidth, 480), height: window.innerHeight * 0.4 }));
  const [linkOpen, setLinkOpen] = useState(false);

  useEffect(() => {
    if (!artRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setSize({ width, height });
    });
    ro.observe(artRef.current);
    return () => ro.disconnect();
  }, []);

  const muscles = useMemo(() => musclesFromRows(rows || [], link.logDate), [rows, link.logDate]);
  const colors = useMemo(() => Object.fromEntries(muscles.map(m => [m.muscle, m.main ? MAIN_MUSCLE_COLOR : HELPED_MUSCLE_COLOR])), [muscles]);
  const colorFor = (m) => colors[m] || null;
  const height = bodyHeight(size.width, size.height);

  const numbers = [
    link.durationSeconds ? [String(Math.max(1, Math.round(link.durationSeconds / 60))), 'min'] : null,
    [String(totalSets), totalSets === 1 ? 'set' : 'sets'],
    volume && volume !== '0' ? [volume, 'kg'] : null,
    calories != null ? [String(calories), 'kcal'] : null,
  ].filter(Boolean);

  return createPortal(
    <div className="wsc-page" role="dialog" aria-modal="true" aria-labelledby="wsc-title">
      <div className="wsc-frame">
        <img src="/logo.png" className="wsc-logo" alt="Fitengineers" />
        <button type="button" className="wsc-close" onClick={onClose} aria-label="Close">
          <Icon size={18}><path d="M6 6l12 12M18 6L6 18" /></Icon>
        </button>

        <div className="wsc-art">
          <div className="wsc-bodies" ref={artRef}>
            <HeatBodyFigure view="front" height={height} colorFor={colorFor} />
            <HeatBodyFigure view="back" height={height} colorFor={colorFor} />
          </div>
        </div>

        <div className="wsc-info">
          <p className="wsc-saved"><Icon size={14}><path d="M5 12l5 5L20 7" /></Icon>Workout saved</p>
          <h2 id="wsc-title">{workoutName}</h2>
          <p className="wsc-date">{dateLabel}</p>

          <div className="wsc-nums">
            {numbers.map(([value, unit]) => <div key={unit}><b>{value}</b><span>{unit}</span></div>)}
          </div>

          {muscles.length > 0 && (
            <ul className="wsc-muscles" aria-label="Sets per muscle">
              {muscles.map(m => <li key={m.muscle}><i style={{ background: colors[m.muscle] }} />{m.muscle} <b>{m.sets}</b></li>)}
            </ul>
          )}

          {bestLift && bestLift.weight > 0 && (
            <div className="wsc-best">
              <Icon size={18}><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" /></Icon>
              <b>{bestLift.exerciseName} {bestLift.weight} {bestLift.unit}{bestLift.reps ? ` × ${bestLift.reps}` : ''}</b>
              <span>{bestLift.isPR ? 'New best' : 'Heaviest lift'}</span>
            </div>
          )}

          <button type="button" className="wsc-share" onClick={() => setLinkOpen(true)}><ShareIcon size={18} />Share workout</button>
          <button type="button" className="wsc-done" onClick={onClose}>Done</button>
        </div>
      </div>
      {linkOpen && <WorkoutShareLinkSheet workout={{ ...link, muscles }} onClose={() => setLinkOpen(false)} />}
    </div>,
    document.body
  );
};

export default WorkoutShareCard;
