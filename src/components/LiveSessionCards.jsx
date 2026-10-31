import React, { useEffect, useMemo, useState } from 'react';
import { FullBodyThumbnail } from './MuscleAnalytics/MuscleThumbnail';
import { MUSCLE_BODY_VIEW, getMuscleGroupsForExercise } from '../utils/muscleGroups';
import { liveMuscleSummary, liftedKg, liftObjectFor, beatsLastTime } from '../utils/liveSessionStats';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './LiveSessionCards.css';

// Line icons (Tabler outline style, 24×24) for the "Today you lifted" card.
const ICONS = {
  bicycle: { d: 'M12 19v-4l-3-3 5-4 2 3h3', circles: [[5, 18, 3], [19, 18, 3], [17, 5, 1]] },
  scooter: { d: 'M8 17h5a6 6 0 0 1 5-5V7a2 2 0 0 0-2-2h-1', circles: [[6, 17, 2], [18, 17, 2]] },
  motorbike: { d: 'M7.5 14h5l4-4H6m1.5 4 4-4M13 6h2l1.5 3 2 4', circles: [[5, 16, 3], [19, 16, 3]] },
  car: { d: 'M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0H9m-6-6h15m-6 0V6', circles: [[7, 17, 2], [17, 17, 2]] },
  suv: { d: 'M5 17H3v-7l2-4h11l3 4h1a1 1 0 0 1 1 1v6h-2m-4 0H9M3 10h18M11 6v4', circles: [[7, 17, 2], [17, 17, 2]] },
  bus: { d: 'M4 17H2V6a1 1 0 0 1 1-1h14a5 7 0 0 1 5 7v5h-2m-4 0H8M16 5l1.5 7H22M2 10h15M7 5v5M12 5v5', circles: [[6, 17, 2], [18, 17, 2]] },
  truck: { d: 'M5 17H3V6a1 1 0 0 1 1-1h9v12m-4 0h6m4 0h2v-6h-8m0-5h5l3 5', circles: [[7, 17, 2], [17, 17, 2]] },
  trophy: { d: 'M8 21h8M12 17v4M7 4h10M17 4v8a5 5 0 0 1-10 0V4M5 9a2 2 0 1 1 0-4h2M19 9a2 2 0 1 0 0-4h-2', circles: [] },
  dumbbell: { d: 'M2 12h1M6 8H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zM9 12h6M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1zM18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M22 12h-1', circles: [] },
};

const Icon = ({ name, size = 30 }) => {
  const icon = ICONS[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icon.d} />
      {icon.circles.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />)}
    </svg>
  );
};

// Muscles worked today: one set → light green, two or more → full green.
const workedColor = (sets) => (sets >= 2 ? '#10b981' : '#6ee7b7');

const formatKg = (kg) => kg.toLocaleString('en-IN', { maximumFractionDigits: 1 });

// How long the gold "New best" moment stays before the card goes back.
const BEST_MS = 3200;

/**
 * The two live cards above the workout logger — client WorkoutTracker and
 * coach Live Log. Plain words only, for people who aren't into gym jargon:
 *
 * 1. Muscles: a front + back body where the muscles today's ticked sets
 *    worked turn green (the one just ticked blinks), "Today you worked …",
 *    and dots for the week's sets of the muscle just trained with "N more
 *    sets to go" / "Done for this week". Same counting and targets as the
 *    Muscles tab's Muscle Balance (see utils/liveSessionStats.js).
 * 2. Today you lifted: the session's kg as an everyday object (a scooter, a
 *    small car …) with how much more to the next one, swapped for a gold
 *    "New best" for a few seconds when a ticked set beats last time.
 *
 * `getPrevSet(exercise, setIdx)` returns last time's set (the PREV column)
 * or null.
 */
const LiveSessionCards = ({ exercises, logDate, savedLogs, getPrevSet }) => {
  const summary = useMemo(() => liveMuscleSummary(savedLogs, exercises, logDate), [savedLogs, exercises, logDate]);
  const kg = useMemo(() => liftedKg(exercises, logDate), [exercises, logDate]);
  const { reached, next } = liftObjectFor(kg);

  const [flash, setFlash] = useState({ muscle: null, key: 0 });
  const [best, setBest] = useState(null);

  // Spot sets that were just ticked (not ones restored from a draft on
  // open): blink their muscle, and celebrate if one beats last time.
  // Keyed by exercise + set + tick time, not list position, so dragging
  // exercises into a new order doesn't look like fresh ticks. Compared
  // during render against the previous list (React's "adjust state when a
  // prop changes" pattern), so there's no extra effect pass.
  const done = new Map();
  (exercises || []).forEach(ex => (ex.sets || []).forEach((set, setIdx) => {
    if (set.isCompleted) done.set(`${ex.name}-${setIdx}-${set.completedAt || ''}`, { ex, set, setIdx });
  }));
  const doneSignature = [...done.keys()].join('|');
  const [seenSignature, setSeenSignature] = useState(doneSignature);
  if (doneSignature !== seenSignature) {
    const before = new Set(seenSignature ? seenSignature.split('|') : []);
    setSeenSignature(doneSignature);
    const fresh = [...done.entries()].filter(([key]) => !before.has(key)).map(([, v]) => v);
    if (fresh.length > 0) {
      const latest = fresh[fresh.length - 1];
      const muscle = getMuscleGroupsForExercise(latest.ex.name)[0] || null;
      if (muscle) setFlash(f => ({ muscle, key: f.key + 1 }));
      const winner = fresh.find(({ ex, set, setIdx }) => beatsLastTime(ex.name, set, getPrevSet ? getPrevSet(ex, setIdx) : null));
      if (winner) setBest({ name: winner.ex.name, weight: parseFloat(winner.set.weight) || 0, reps: parseInt(winner.set.reps, 10) || 0, at: doneSignature });
    }
  }

  useEffect(() => {
    if (!best) return undefined;
    const timer = setTimeout(() => setBest(null), BEST_MS);
    return () => clearTimeout(timer);
  }, [best]);

  const workedSets = Object.fromEntries(summary.worked.map(w => [w.muscle, w.sets]));
  const workedMuscles = summary.worked.map(w => w.muscle);
  const colorFor = (m) => workedColor(workedSets[m] || 0);
  const names = workedMuscles.slice(0, 3).join(', ') + (workedMuscles.length > 3 ? ` +${workedMuscles.length - 3}` : '');

  const focus = summary.focus;
  const dotCount = focus ? Math.min(24, Math.max(focus.target, Math.floor(focus.sets))) : 0;
  const filled = focus ? Math.floor(focus.sets) : 0;

  return (
    <div className="live-cards" aria-live="polite">
      <div className="live-card live-card-muscles">
        <div className="live-card-body-tile">
          {['front', 'back'].map(view => (
            <FullBodyThumbnail
              key={view}
              view={view}
              fullFigure
              width={44}
              height={82}
              trainedMuscles={workedMuscles}
              colorFor={colorFor}
              flashMuscle={MUSCLE_BODY_VIEW[flash.muscle] === view ? flash.muscle : null}
              flashKey={flash.key}
            />
          ))}
        </div>
        <div className="live-card-col">
          <span className="live-card-small">Today you worked</span>
          <strong className={`live-card-names${names ? '' : ' is-empty'}`}>{names || 'Nothing yet'}</strong>
        </div>
        <div className="live-card-col">
          {focus ? (
            <>
              <span className="live-card-small">{focus.muscle} this week</span>
              <div className="live-card-dots" role="img" aria-label={`${focus.sets} of ${focus.target} sets`}>
                {Array.from({ length: dotCount }, (_, i) => (
                  <span key={i} className={`live-card-dot${i < filled ? ' is-on' : ''}${i === filled - 1 && flash.key ? ' is-new' : ''}`} />
                ))}
              </div>
              {focus.left > 0 ? (
                <strong className="live-card-msg">{focus.left === 1 ? '1 more set to go' : `${focus.left} more sets to go`}</strong>
              ) : (
                <strong className="live-card-msg is-done">Done for this week</strong>
              )}
            </>
          ) : (
            <>
              <span className="live-card-small">This week</span>
              <strong className="live-card-msg is-empty">Tick a set to see it here</strong>
            </>
          )}
        </div>
      </div>

      <div className={`live-card live-card-lift${best ? ' is-best' : ''}`}>
        <div className="live-card-icon-tile" key={best ? 'best' : (reached?.key || 'none')}>
          <Icon name={best ? 'trophy' : (reached?.key || 'dumbbell')} />
        </div>
        <div className="live-card-col">
          {best ? (
            <>
              <span className="live-card-small">New best</span>
              <strong className="live-card-names">{best.name}: {best.weight > 0 ? `${formatKg(best.weight)} kg × ${best.reps}` : `${best.reps} reps`}</strong>
              <span className="live-card-small">Better than last time. Keep going</span>
            </>
          ) : (
            <>
              <span className="live-card-small">Today you lifted</span>
              <strong className="live-card-names">
                {formatKg(kg)} kg
                {reached && <span className="live-card-equals"> = {reached.label}</span>}
              </strong>
              {next ? (
                <>
                  <div className="live-card-bar"><i style={{ width: `${Math.min(100, (kg / next.kg) * 100)}%` }} /></div>
                  <span className="live-card-small">{formatKg(Math.ceil(next.kg - kg))} kg more to lift {next.label}</span>
                </>
              ) : (
                <span className="live-card-small">More than a truck. Amazing</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveSessionCards;
