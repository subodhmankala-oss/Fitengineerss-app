import React from 'react';
import { formatShortLogDate } from '../utils/liveWorkoutTimer';
import './LeftoverExercisesCard.css';

// "Left over from last time" card at the top of the coach's Live Log:
// exercises not started when the client's previous session ran out of time
// (see utils/workoutLeftovers.js). `items` is already filtered to names not
// in the current session.
const LeftoverExercisesCard = ({ items, onAdd, onDismiss }) => {
  if (!items || items.length === 0) return null;
  const dates = [...new Set(items.map(it => it.date).filter(Boolean))];
  const from = dates.length === 1 ? ` from ${formatShortLogDate(dates[0])}` : '';
  return (
    <div className="leftover-card" data-testid="leftover-card">
      <span className="leftover-icon" aria-hidden="true">⏭</span>
      <div className="leftover-body">
        <div className="leftover-label">Left over{from}</div>
        <div className="leftover-hint">Not done in the last session</div>
        <ul className="leftover-names">
          {items.map(it => <li key={it.name}>{it.name}</li>)}
        </ul>
        <div className="leftover-actions">
          <button type="button" className="leftover-add" onClick={onAdd}>
            + Add {items.length === 1 ? 'it' : `all ${items.length}`}
          </button>
          <button type="button" className="leftover-dismiss" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeftoverExercisesCard;
