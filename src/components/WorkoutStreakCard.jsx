import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeWorkoutStreak, nextStreakMilestone, streakTier, recentStreakDays } from '../utils/workoutStreak';
import { getLocalDateString, parseLocalDateString, shiftLocalDateString } from '../utils/dateUtils';
import './WorkoutStreakCard.css';

const weekdayOf = (dateStr, weekday) => parseLocalDateString(dateStr).toLocaleDateString('en-US', { weekday });

// "today" / "tomorrow" / "Friday" for a date within the keep-alive window.
const dayPhrase = (dateStr) => {
  const today = getLocalDateString();
  if (dateStr === today) return 'today';
  if (dateStr === shiftLocalDateString(today, 1)) return 'tomorrow';
  return weekdayOf(dateStr, 'long');
};

// Always says WHEN the next workout is needed. keepAliveBy is the last day a
// workout still extends the chain.
const hintFor = ({ status, keepAliveBy }) => {
  if (status === 'active') return `Nice work today! 💪 Train again by ${dayPhrase(keepAliveBy)} to keep your streak going.`;
  if (status === 'at_risk') {
    return keepAliveBy === getLocalDateString()
      ? 'Train today to keep your streak alive!'
      : `Train by ${dayPhrase(keepAliveBy)} to keep your streak alive.`;
  }
  return 'One workout starts a new streak. Let’s go!';
};

const POP_WIDTH = 300;
const EDGE = 16;

// Client-only streak: a compact flame pill (tap → detail popover). It sits on
// Home's top card, so the popover is portalled to <body> and placed under the
// badge — a card's overflow:hidden must not clip it. Hidden until the client
// has logged a workout so a brand-new client isn't greeted with "0".
export default function WorkoutStreakCard({ logs, className = '' }) {
  const streak = useMemo(() => computeWorkoutStreak(logs), [logs]);
  const week = useMemo(() => recentStreakDays(logs), [logs]);
  const [anchor, setAnchor] = useState(null); // badge rect while open
  const wrapRef = useRef(null);
  const popRef = useRef(null);

  // Close on an outside tap, Escape, or when the page scrolls under it.
  useEffect(() => {
    if (!anchor) return undefined;
    const inside = (t) => wrapRef.current?.contains(t) || popRef.current?.contains(t);
    const onDown = (e) => { if (!inside(e.target)) setAnchor(null); };
    const onKey = (e) => { if (e.key === 'Escape') setAnchor(null); };
    const onScroll = (e) => { if (!inside(e.target)) setAnchor(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [anchor]);

  if (streak.status === 'none') return null;

  const { current, best, status } = streak;
  const lapsed = status === 'lapsed';
  const stateClass = status === 'active' ? 'is-active' : lapsed ? 'is-lapsed' : 'is-at-risk';
  const tier = streakTier(current);
  const milestone = nextStreakMilestone(current);
  const isNewBest = !lapsed && current >= 2 && current === best;
  const title = lapsed ? 'No active streak' : `${current} ${current === 1 ? 'workout' : 'workouts'} in a row`;

  const toggle = (e) => {
    e.stopPropagation();
    setAnchor(a => (a ? null : e.currentTarget.getBoundingClientRect()));
  };

  let popStyle;
  if (anchor) {
    const vw = window.innerWidth;
    const width = Math.min(POP_WIDTH, vw - EDGE * 2);
    const left = Math.max(EDGE, Math.min(anchor.left, vw - width - EDGE));
    popStyle = { position: 'fixed', top: anchor.bottom + 10, left, right: 'auto', width, transformOrigin: `${anchor.left - left + 12}px 0` };
  }

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
            <span>🏅 Next badge: {milestone.target} workouts in a row</span>
            <span>{milestone.remaining} to go</span>
          </div>
          <div className="streak-goal-bar">
            <div className="streak-goal-fill" style={{ width: `${Math.max(6, Math.round(milestone.progress * 100))}%` }} />
          </div>
        </div>
      )}

      <div className="streak-hint">{hintFor(streak)}</div>
    </div>
  );

  return (
    <span ref={wrapRef} className={className}>
      <button
        type="button"
        className={`streak-badge ${stateClass}`}
        onClick={toggle}
        onKeyDown={(e) => e.stopPropagation()}
        aria-expanded={!!anchor}
        aria-label={`${title}. Tap for details`}
      >
        <span className="streak-flame" aria-hidden="true">🔥</span>
        {current}
      </button>
      {anchor && createPortal(
        <div ref={popRef} role="dialog" aria-label="Workout streak" className={`streak-pop ${stateClass}`} style={popStyle}>
          {detail}
        </div>,
        document.body
      )}
    </span>
  );
}
