import React, { useEffect, useMemo, useRef, useState } from 'react';
import { computeWorkoutStreak, nextStreakMilestone, streakTier, recentStreakDays } from '../utils/workoutStreak';
import { getLocalDateString, parseLocalDateString } from '../utils/dateUtils';
import './WorkoutStreakCard.css';

const weekdayOf = (dateStr, weekday) => parseLocalDateString(dateStr).toLocaleDateString('en-US', { weekday });

const hintFor = ({ status, keepAliveBy }) => {
  if (status === 'active') return 'Flame fed for today. Nice work! 💪';
  if (status === 'at_risk') {
    return keepAliveBy === getLocalDateString()
      ? 'Your flame is hungry — train today to keep it lit!'
      : `Feed your flame by ${weekdayOf(keepAliveBy, 'long')} to keep it lit.`;
  }
  return 'One workout relights it. Let’s go!';
};

// Streak display, hidden until the client has logged a workout so a brand-new
// client isn't greeted with "0". variant="badge" is the compact flame pill for
// the client's Home header (tap → detail popover); "card" is the full detail
// inline, used on the coach's client History tab.
export default function WorkoutStreakCard({ logs, variant = 'card' }) {
  const streak = useMemo(() => computeWorkoutStreak(logs), [logs]);
  const week = useMemo(() => recentStreakDays(logs), [logs]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close the badge's detail popover on an outside tap or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (streak.status === 'none') return null;

  const { current, best, status } = streak;
  const lapsed = status === 'lapsed';
  const stateClass = status === 'active' ? 'is-active' : lapsed ? 'is-lapsed' : 'is-at-risk';
  const tier = streakTier(current);
  const milestone = nextStreakMilestone(current);
  const isNewBest = !lapsed && current >= 2 && current === best;
  const title = lapsed ? 'No active streak' : `${current} ${current === 1 ? 'workout' : 'workouts'} in a row`;

  const detail = (
    <div className={`streak-detail ${stateClass}`}>
      <div className="streak-head">
        <span className="streak-flame" aria-hidden="true">🔥</span>
        <div className="streak-head-text">
          <div className="streak-tier">{tier.emoji} {tier.title}</div>
          <div className="streak-count">{title}</div>
          {isNewBest && <span className="streak-newbest">🏆 New best!</span>}
        </div>
        <div className="streak-best">
          <div className="streak-best-num">{best}</div>
          <div className="streak-best-label">BEST</div>
        </div>
      </div>

      <div className="streak-week" aria-label="Last 7 days">
        {week.map(d => (
          <div key={d.date} className={`streak-day${d.trained ? ' is-trained' : ''}${d.isToday ? ' is-today' : ''}`}>
            <div className="streak-day-cell">
              {d.trained ? '🔥' : <span className="streak-day-dot" />}
            </div>
            <span className="streak-day-label">{d.isToday ? 'Today' : weekdayOf(d.date, 'narrow')}</span>
          </div>
        ))}
      </div>

      {!lapsed && milestone && (
        <div className="streak-goal">
          <div className="streak-goal-text">
            <span>Next badge</span>
            <span>{milestone.remaining} more to 🏅 {milestone.target}</span>
          </div>
          <div className="streak-goal-bar">
            <div className="streak-goal-fill" style={{ width: `${Math.max(6, Math.round(milestone.progress * 100))}%` }} />
          </div>
        </div>
      )}

      <div className="streak-hint">{hintFor(streak)}</div>
    </div>
  );

  if (variant === 'badge') {
    return (
      // Not position:relative — the popover anchors to the caller's
      // positioned container so it can align with the screen edge instead of
      // this narrow badge (which would push it off-screen on a phone).
      <div ref={wrapRef}>
        <button
          type="button"
          className={`streak-badge ${stateClass}`}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-label={`${title}. Tap for details`}
        >
          <span className="streak-flame" aria-hidden="true">🔥</span>
          {current}
        </button>
        {open && (
          <div role="dialog" aria-label="Workout streak" className={`streak-pop ${stateClass}`}>
            {detail}
          </div>
        )}
      </div>
    );
  }

  return <div className={`streak-card ${stateClass}`}>{detail}</div>;
}
