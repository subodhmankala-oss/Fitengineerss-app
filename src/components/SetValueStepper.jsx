import React from 'react';
import SetValueField from './SetValueField';

// Wraps SetValueField with tap +/- nudges (±2.5kg weight, ±1 rep) so most
// in-set adjustments never need to open the number pad at all. Nudging goes
// through the same onValue callback the pad itself would call, so it clears
// any ghost/PREV styling (see handleSetChange/handleLiveSetChange) and
// autosaves exactly like a typed edit — no separate persistence path.
export default function SetValueStepper({
  value, placeholder, disabled, active, isGhost, onOpen, onValue, step, decimals = 0, min = 0,
}) {
  const nudge = (delta) => {
    if (disabled) return;
    const current = parseFloat(value);
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.max(min, base + delta);
    const rounded = decimals > 0 ? Number(next.toFixed(decimals)) : Math.round(next);
    onValue(String(rounded));
  };

  return (
    <div className="set-value-stepper">
      <button
        type="button"
        className="set-stepper-btn set-stepper-btn--minus"
        onClick={() => nudge(-step)}
        disabled={disabled}
        tabIndex={-1}
        aria-label="Decrease"
      >
        −
      </button>
      <SetValueField
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        active={active}
        isGhost={isGhost}
        onOpen={onOpen}
        className="set-value-btn--stepped"
      />
      <button
        type="button"
        className="set-stepper-btn set-stepper-btn--plus"
        onClick={() => nudge(step)}
        disabled={disabled}
        tabIndex={-1}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}
