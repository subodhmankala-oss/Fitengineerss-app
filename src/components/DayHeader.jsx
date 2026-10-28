import React from 'react';
import { formatDurationShort } from '../utils/monthlyProgress';
import './DayHeader.css';

// Line icons (Tabler outline paths).
const DUMBBELL = 'M2 12h1M6 8H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zM9 12h6M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1zM18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M22 12h-1';
const CUP = 'M3 14c.83.642 2.077 1.017 3.5 1 1.423.017 2.67-.358 3.5-1 .83-.642 2.077-1.017 3.5-1 1.423-.017 2.67.358 3.5 1M8 3a2.4 2.4 0 0 0-1 2 2.4 2.4 0 0 0 1 2M12 3a2.4 2.4 0 0 0-1 2 2.4 2.4 0 0 0 1 2M3 10h14v5a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6zM16.746 16.726a3 3 0 1 0 .252-5.555';
const CHECK = 'M5 12l5 5L20 7';
const CLOCK = 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0M12 7v5l3 3';

const Icon = ({ d, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

/**
 * Top of the Daily tab (client and coach): an icon tile, the workout name
 * with the day + "Completed"/"Rest day" under it, and the session length as
 * a pill on the right. `dateLabel` shows under the title only when the title
 * is a plan name (otherwise the title already is the date).
 */
const DayHeader = ({ title, dateLabel, done, durationSeconds }) => (
  <div className={`day-header ${done ? 'is-done' : 'is-rest'}`}>
    <div className="day-header-tile"><Icon d={done ? DUMBBELL : CUP} size={20} /></div>
    <div className="day-header-text">
      <h3>{title}</h3>
      <div className="day-header-sub">
        {dateLabel && <span>{dateLabel}</span>}
        {dateLabel && <span className="day-header-dot" aria-hidden="true">·</span>}
        {done
          ? <span className="day-header-status"><Icon d={CHECK} size={12} />Completed</span>
          : <span>Rest day</span>}
      </div>
    </div>
    {done && durationSeconds != null && (
      <span className="day-header-time" title="Session length">
        <Icon d={CLOCK} size={13} />{formatDurationShort(durationSeconds)}
      </span>
    )}
  </div>
);

export default DayHeader;
