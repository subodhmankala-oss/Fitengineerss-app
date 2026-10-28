import React from 'react';
import { formatDurationShort } from '../utils/monthlyProgress';
import './DayHeader.css';

const CHECK = 'M5 12l5 5L20 7';
const CLOCK = 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0M12 7v5l3 3';

const Icon = ({ d, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/**
 * Top of the Daily tab (client and coach). Top row: an optional tiny
 * `eyebrow` label ("Workout name") on the left and the small `actions` chips
 * (Edit / Add missed workout) on the right. Then the title, then
 * "✓ Completed · 🕐 8m". The date bar goes right below it.
 */
const DayHeader = ({ eyebrow, title, done, durationSeconds, actions }) => (
  <div className="day-header">
    {(eyebrow || actions) && (
      <div className="day-header-top">
        <div className="day-header-eyebrow">{eyebrow}</div>
        {actions && <div className="day-header-actions">{actions}</div>}
      </div>
    )}
    <h3>{title}</h3>
    <div className="day-header-sub">
      {done ? <span className="day-header-done"><Icon d={CHECK} size={12} />Completed</span> : <span>No workout logged</span>}
      {done && durationSeconds != null && (
        <span className="day-header-time" title="Session length"><Icon d={CLOCK} size={12} />{formatDurationShort(durationSeconds)}</span>
      )}
    </div>
  </div>
);

export default DayHeader;
