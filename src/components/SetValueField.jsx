import React from 'react';
import { scrollFieldClearOfPad } from '../utils/numberPadScroll';

// Stand-in for a native <input> in the set-logging tables (weight/reps/km/
// time). Tapping it opens the shared SetNumberPad instead of the phone's own
// keyboard — see SetNumberPad.jsx for why. Renders as a <button> styled
// identically to the old text input (see the shared ".set-value-btn" rules
// in WorkoutTracker.css) so it drops into the existing table layout as-is.
//
// `isGhost`: the shown value came from PREV (last logged), not from the
// client — rendered dimmed/italic so it reads as "this is what we're
// guessing you'll do, tap ✓ to confirm or edit it" rather than a value
// they've already typed. Clears the moment they edit the field or complete
// the set (see weightFromPrev/repsFromPrev in prevSets.js).
export default function SetValueField({ value, placeholder, disabled, active, isGhost, onOpen, className = '' }) {
  const handleClick = (e) => {
    onOpen();
    scrollFieldClearOfPad(e.currentTarget);
  };

  return (
    <button
      type="button"
      className={`set-value-btn ${active ? 'is-active' : ''} ${isGhost && !disabled ? 'set-value-ghost' : ''} ${className}`.trim()}
      onClick={handleClick}
      disabled={disabled}
    >
      {value ? value : <span className="set-value-placeholder">{placeholder}</span>}
      {active && !disabled && <span className="set-value-caret" />}
    </button>
  );
}
