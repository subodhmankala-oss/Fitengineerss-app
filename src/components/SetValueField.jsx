import React from 'react';

// Stand-in for a native <input> in the set-logging tables (weight/reps/km/
// time). Tapping it opens the shared SetNumberPad instead of the phone's own
// keyboard — see SetNumberPad.jsx for why. Renders as a <button> styled
// identically to the old text input (see the shared ".set-value-btn" rules
// in WorkoutTracker.css) so it drops into the existing table layout as-is.
export default function SetValueField({ value, placeholder, disabled, active, onOpen, className = '' }) {
  const handleClick = (e) => {
    onOpen();
    // Bring the row clear of the pad instead of leaving it hidden underneath
    // — the only way to actually see the value you're typing, since the pad
    // itself never shows it, only the field name. `scrollIntoView({block:
    // 'center'})` isn't reliable here: it centers within the WHOLE viewport,
    // including the ~45% of it the pad covers, so a row near the bottom of
    // a long exercise list can still land behind the pad. Instead, measure
    // the pad's real on-screen height and scroll just enough to clear it
    // (plus a margin), the same way you'd account for a fixed footer.
    const el = e.currentTarget;
    requestAnimationFrame(() => {
      const pad = document.querySelector('.set-number-pad');
      const padHeight = pad ? pad.getBoundingClientRect().height : 320;
      const margin = 16;
      const rect = el.getBoundingClientRect();
      const visibleBottom = window.innerHeight - padHeight - margin;
      let delta = 0;
      if (rect.bottom > visibleBottom) {
        delta = rect.bottom - visibleBottom;
      } else if (rect.top < margin) {
        delta = rect.top - margin;
      }
      if (delta !== 0) {
        const scrollContainer = el.closest('.main-content');
        if (scrollContainer) {
          scrollContainer.scrollBy({ top: delta, behavior: 'smooth' });
        } else {
          window.scrollBy({ top: delta, behavior: 'smooth' });
        }
      }
    });
  };

  return (
    <button
      type="button"
      className={`set-value-btn ${active ? 'is-active' : ''} ${className}`.trim()}
      onClick={handleClick}
      disabled={disabled}
    >
      {value ? value : <span className="set-value-placeholder">{placeholder}</span>}
      {active && !disabled && <span className="set-value-caret" />}
    </button>
  );
}
