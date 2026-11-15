import React, { useEffect, useState } from 'react';
import './SetMuscleRing.css';

// Ring beside a set's tick: how far this week's sets for the exercise's main
// muscle have got toward its weekly target (see utils/setMuscleRing.js).
// Plain grey = not ticked yet, amber = still under target, green with a
// check = target hit, dashed grey = ticked but not counted (no kg / no reps).
// Tap for the numbers. Rows with no ring keep an empty slot of the same
// width so the ticks stay lined up.
const R = 10;
const C = 2 * Math.PI * R;

export default function SetMuscleRing({ ring }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => setOpen(false), 2500);
    return () => clearTimeout(t);
  }, [open]);

  if (!ring) return <span className="set-muscle-ring set-muscle-ring--empty" aria-hidden="true" />;

  const { state, fraction, muscle, sets, target } = ring;
  const label = state === 'idle'
    ? `${muscle} · ${sets} of ${target} sets this week so far`
    : state === 'none'
    ? 'Not counted: needs kg and reps'
    : state === 'done'
      ? `${muscle} · ${sets} of ${target} sets, weekly target hit`
      : `${muscle} · ${sets} of ${target} sets this week`;

  return (
    <button
      type="button"
      className={`set-muscle-ring set-muscle-ring--${state}`}
      aria-label={label}
      title={label}
      onClick={() => setOpen(o => !o)}
    >
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle className="smr-track" cx="13" cy="13" r={R} strokeDasharray={state === 'none' ? '3 3' : undefined} />
        {(state === 'progress' || state === 'done') && fraction > 0 && (
          <circle
            className="smr-fill"
            cx="13" cy="13" r={R}
            strokeDasharray={`${(C * fraction).toFixed(1)} ${C.toFixed(1)}`}
            transform="rotate(-90 13 13)"
          />
        )}
        {state === 'done' && <path className="smr-check" d="M9 13.5l2.6 2.6L17 10.5" />}
      </svg>
      {open && <span className="set-muscle-ring-tip" role="status">{label}</span>}
    </button>
  );
}
