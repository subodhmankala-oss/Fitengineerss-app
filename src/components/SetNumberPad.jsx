import React from 'react';
import './SetNumberPad.css';

// Custom on-screen numeric pad for the set-logging tables' Kg/Reps/Km/Time
// fields. Replaces the phone's native keyboard entirely — see
// utils/setInputUtils.js for why. `active` is a descriptor built fresh on
// every render by the caller (WorkoutTracker.jsx / TrainerDashboard.jsx) via
// useSetNumberPad's registry, so it always reflects the field's current
// live value — never a stale snapshot from whenever it was first opened:
//   { value, mode: 'decimal' | 'integer' | 'time', onValue, onPrev, onNext, label }
// `activeKey` is the field's registry key, passed separately (rather than
// read off `active`) purely so this component can tell "still the same
// field" apart from "value changed" without `active` needing its own
// identity-bearing `key` property.
//
// The ▲▼ on the left move between fields in the same row (Kg <-> Reps, Km
// <-> Time) manually. Typing also auto-advances to the next field once you
// pause — debounced so multi-digit numbers finish first, and safe against
// the staleness bug an earlier version of this had: `active.value` here
// always comes fresh from the registry on every render (see
// utils/setInputUtils.js), never a snapshot frozen from when the field was
// opened, so the value that lands in the next field is always correct.
const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
const AUTO_ADVANCE_DELAY = 550;

function BackspaceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6.5-7L9 5z" />
      <line x1="12.5" y1="9.5" x2="18" y2="14.5" />
      <line x1="18" y1="9.5" x2="12.5" y2="14.5" />
    </svg>
  );
}

function KeyboardHideIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="10" rx="2" />
      <circle cx="7" cy="9" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="9" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="17" cy="9" r="0.6" fill="currentColor" stroke="none" />
      <line x1="6.5" y1="12.5" x2="17.5" y2="12.5" />
      <polyline points="9 19 12 22 15 19" />
    </svg>
  );
}

export default function SetNumberPad({ active, activeKey, onClose }) {
  // Keep rendering the last field's content while the panel slides shut, so
  // it doesn't blank out mid-animation.
  const [shown, setShown] = React.useState(active);
  const autoAdvanceTimer = React.useRef(null);

  React.useEffect(() => {
    if (active) setShown(active);
    // A new field opened (manually, or via the previous field's own auto-
    // advance) — any pending auto-advance from the field we just left no
    // longer applies.
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
  }, [activeKey]);

  React.useEffect(() => () => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
  }, []);

  const press = (key) => {
    if (!active) return;
    const { value, mode, onValue, onNext } = active;

    if (key === 'back') {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
      if (mode === 'time') {
        onValue(String(value ?? '').replace(/\D/g, '').slice(0, -1));
      } else {
        onValue(String(value ?? '').slice(0, -1));
      }
      return;
    }

    if (key === '.') {
      if (mode !== 'decimal' || String(value ?? '').includes('.')) return;
      onValue(`${value ?? ''}.`);
    } else if (mode === 'time') {
      onValue(`${String(value ?? '').replace(/\D/g, '')}${key}`);
    } else {
      onValue(`${value ?? ''}${key}`);
    }

    if (onNext) {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = setTimeout(() => {
        autoAdvanceTimer.current = null;
        onNext();
      }, AUTO_ADVANCE_DELAY);
    }
  };

  const field = active || shown;

  return (
    <div className={`set-number-pad ${active ? 'open' : ''}`} role="group" aria-label={field?.label || 'Number pad'}>
      <div className="set-number-pad-nav">
        <div className="set-number-pad-fieldnav">
          <button
            type="button"
            className="set-number-pad-fieldnav-btn"
            onClick={() => field?.onPrev && field.onPrev()}
            disabled={!field?.onPrev}
            aria-label="Previous field"
          >▲</button>
          <button
            type="button"
            className="set-number-pad-fieldnav-btn"
            onClick={() => field?.onNext && field.onNext()}
            disabled={!field?.onNext}
            aria-label="Next field"
          >▼</button>
        </div>
        <span className="set-number-pad-label">{field?.label}</span>
        <button
          type="button"
          className="set-number-pad-done"
          onClick={onClose}
          aria-label="Hide keyboard"
        ><KeyboardHideIcon /></button>
      </div>
      <div className="set-number-pad-grid">
        {PAD_KEYS.map((key) => {
          const isDot = key === '.';
          const isPlain = isDot || key === 'back';
          const dotDisabled = isDot && field?.mode !== 'decimal';
          return (
            <button
              type="button"
              key={key}
              className={`set-number-pad-key ${isPlain ? 'set-number-pad-key--plain' : ''} ${dotDisabled ? 'set-number-pad-key--disabled' : ''}`}
              onClick={() => press(key)}
              disabled={dotDisabled}
              aria-label={key === 'back' ? 'Backspace' : key === '.' ? 'Decimal point' : key}
            >
              {key === 'back' ? <BackspaceIcon /> : <span className="set-number-pad-key-digit">{key}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
