import React, { useEffect, useState } from 'react';
import { getMuscleGroupsForExercise } from '../utils/muscleGroups';
import { NOT_TRAINED } from '../utils/setMuscleRing';
import MuscleThumbnail from './MuscleAnalytics/MuscleThumbnail';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './SetMuscleRing.css';

// Ring beside a set's tick: how far this week's sets for the exercise's main
// muscle have got toward its weekly target (see utils/setMuscleRing.js).
// The week's count sits inside the ring ("11/12"), in the Muscle Balance
// card's status colours: orange = Undertrained, yellow = Slightly Low,
// green = Optimal, blue = High Volume; slate = not ticked yet, dashed =
// ticked but not counted (no kg / no reps). Tap for the muscle's name. Rows with no ring keep an empty slot of the same
// width so the ticks stay lined up.
const SIZE = 34;
const MID = SIZE / 2;
const R = 15;
const C = 2 * Math.PI * R;

export default function SetMuscleRing({ ring }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => setOpen(false), 2500);
    return () => clearTimeout(t);
  }, [open]);

  if (!ring) return <span className="set-muscle-ring set-muscle-ring--empty" aria-hidden="true" />;

  const { state, fraction, muscle, sets, target, color } = ring;
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
      style={{ '--ring-color': color }}
      aria-label={label}
      title={label}
      onClick={() => setOpen(o => !o)}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle className="smr-track" cx={MID} cy={MID} r={R} strokeDasharray={state === 'none' ? '3 3' : undefined} />
        {(state === 'progress' || state === 'done') && fraction > 0 && (
          <circle
            className="smr-fill"
            cx={MID} cy={MID} r={R}
            strokeDasharray={`${(C * fraction).toFixed(1)} ${C.toFixed(1)}`}
            transform={`rotate(-90 ${MID} ${MID})`}
          />
        )}
      </svg>
      {/* Whole sets only — a secondary muscle's half set would read "10.5/12". */}
      <span className="smr-count" aria-hidden="true">{state === 'none' ? '–' : `${Math.floor(sets)}/${target}`}</span>
      {open && <span className="set-muscle-ring-tip" role="status">{label}</span>}
    </button>
  );
}

// Header over the ring column: a small drawing of the exercise's main muscle
// (the same heat-map artwork as the Muscle Balance cards), coloured like the
// rings below it (the Muscle Balance status colours; slate until a set is ticked).
// It takes the colour of the exercise's last counted set. An empty slot when the
// exercise maps to no muscle, so "✓ all" stays over the ticks either way.
export function SetRingHeaderMuscle({ exerciseName, rings, exIdx }) {
  const muscle = getMuscleGroupsForExercise(exerciseName)[0];
  if (!muscle) return <span className="set-ring-col-muscle" aria-hidden="true" />;
  const counted = Object.entries(rings || {})
    .filter(([key, r]) => key.startsWith(`${exIdx}-`) && (r.state === 'progress' || r.state === 'done'))
    .map(([, r]) => r);
  const color = counted.length ? counted[counted.length - 1].color : NOT_TRAINED;
  return (
    <span className="set-ring-col-muscle" title={muscle} style={{ '--status-color': color }}>
      <MuscleThumbnail muscle={muscle} color={color} size={30} />
    </span>
  );
}
