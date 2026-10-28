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
 * Top of the Daily tab (client and coach), laid out like the Muscles header:
 * the workout name on the left with its status underneath, and the session
 * length as a tinted chip on the right. The date bar goes right below it.
 */
const DayHeader = ({ title, done, durationSeconds }) => (
  <div className="day-header">
    <div className="day-header-text">
      <h3>{title}</h3>
      {done
        ? <div className="day-header-sub is-done"><Icon d={CHECK} size={12} />Completed</div>
        : <div className="day-header-sub">No workout logged</div>}
    </div>
    {done && durationSeconds != null && (
      <span className="day-header-time" title="Session length">
        <Icon d={CLOCK} size={13} />{formatDurationShort(durationSeconds)}
      </span>
    )}
  </div>
);

export default DayHeader;
