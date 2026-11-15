import React, { useEffect, useState } from 'react';
import { getMuscleGroupsForExercise } from '../utils/muscleGroups';
import MuscleThumbnail from './MuscleAnalytics/MuscleThumbnail';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './SetMuscleRing.css';

// Ring beside a set's tick: how far this week's sets for the exercise's main
// muscle have got toward its weekly target (see utils/setMuscleRing.js).
// The week's count sits inside the ring ("11/12"). Plain grey = not ticked
// yet, amber = still under target, green = target hit, dashed grey = ticked
// but not counted (no kg / no reps). Tap for the muscle's name. Rows with no ring keep an empty slot of the same
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
// rings below it — grey until a set is ticked, amber while this week's sets
// are under target, green once the target is hit. An empty slot when the
// exercise maps to no muscle, so "✓ all" stays over the ticks either way.
const HEADER_COLORS = { idle: '#94a3b8', progress: '#d97706', done: '#16a34a' };

export function SetRingHeaderMuscle({ exerciseName, rings, exIdx }) {
  const muscle = getMuscleGroupsForExercise(exerciseName)[0];
  if (!muscle) return <span className="set-ring-col-muscle" aria-hidden="true" />;
  const states = Object.entries(rings || {})
    .filter(([key]) => key.startsWith(`${exIdx}-`))
    .map(([, r]) => r.state);
  const state = states.includes('done') ? 'done' : states.includes('progress') ? 'progress' : 'idle';
  const color = HEADER_COLORS[state];
  return (
    <span className="set-ring-col-muscle" title={muscle} style={{ '--status-color': color }}>
      <MuscleThumbnail muscle={muscle} color={color} size={30} />
    </span>
  );
}
