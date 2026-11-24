import React, { useState } from 'react';
import SwipeToHide from './SwipeToHide';
import WeekWorkoutSheet from './WeekWorkoutSheet';
import { FullBodyThumbnail } from './MuscleAnalytics/MuscleThumbnail';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './WeekPlanCard.css';

// Heat-map tints: the muscles a workout mainly targets, and the ones it also
// works.
const HEAT = { main: '#ef4444', also: '#f59e0b' };

/**
 * The self-guided client's week as one slim card at the top of Home: the
 * workout to do now, with a bar per workout of the week above its name
 * (green once saved, blue for this one). Tapping the card slides the full
 * workout up from the bottom (WeekWorkoutSheet: exercises, the other days,
 * Change days); the play button starts it straight away. Swipe left to hide
 * it for the week.
 *
 * plan: buildWeekPlan() · sessionFor(slot): what the logger will build ·
 * loggedFor(slot): what was saved for a done one · note: replaces "Day 2 of 4".
 */
export default function WeekPlanCard({ plan, levelLabel, note, days, hintKey, sessionFor, loggedFor, onStart, onChangeDays, onHide }) {
  const [open, setOpen] = useState(false);
  const { slots, main, doneCount, weekDone, nextWeek, nextProgram } = plan;

  // A finished week still offers the next workout.
  const slot = main || { program: nextProgram, date: '', done: false, isToday: false };
  const session = sessionFor(slot);
  const { program } = slot;

  let line = `Day ${slots.indexOf(main) + 1} of ${slots.length}`;
  if (weekDone) line = `Week done, ${doneCount} of ${slots.length}`;
  else if (nextWeek) line = `Next week, day 1 of ${slots.length}`;

  return (
    <section className="wpc" aria-label="Your workout week">
      <SwipeToHide onHide={onHide} hintKey={hintKey} hideLabel="Hide this week">
        <div className="wpc-card">
          <button
            type="button"
            className="wpc-open"
            aria-haspopup="dialog"
            aria-label={`See ${program.name}${session.focus.length ? ` — ${session.focus.join(', ')}` : ''}`}
            onClick={() => setOpen(true)}
          >
            {session.muscles.length > 0 && (
              // --status-color tints the thumbnail's backdrop (.muscle-thumb).
              <span className="wpc-body">
                <FullBodyThumbnail
                  trainedMuscles={session.muscles}
                  view={session.view}
                  size={52}
                  colorFor={(m) => (session.main.has(m) ? HEAT.main : HEAT.also)}
                />
              </span>
            )}
            <span className="wpc-text">
              <span className="wpc-line">
                <span className={`wpc-bars ${slots.length > 5 ? 'many' : ''}`} aria-hidden="true">
                  {slots.map((s, i) => (
                    <span key={i} className={`wpc-bar ${s.done ? 'done' : s === main ? 'now' : ''}`} />
                  ))}
                </span>
                <span className={note || weekDone ? 'wpc-note' : ''}>{note || line}</span>
              </span>
              <span className="wpc-name">{program.name}</span>
              <span className="wpc-stats">
                {session.minutes} min · {session.exerciseCount} exercise{session.exerciseCount === 1 ? '' : 's'} · {session.setCount} sets
              </span>
            </span>
          </button>
          <button type="button" className="wpc-play" aria-label={`Start ${program.name}`} onClick={() => onStart(slot)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14z" /></svg>
          </button>
        </div>
      </SwipeToHide>
      {open && (
        <WeekWorkoutSheet
          entries={weekDone ? [...slots, slot] : slots}
          initialIndex={weekDone ? slots.length : slots.indexOf(main)}
          levelLabel={levelLabel}
          note={note}
          days={days}
          heat={HEAT}
          sessionFor={sessionFor}
          loggedFor={loggedFor}
          onStart={(s) => { setOpen(false); onStart(s); }}
          onChangeDays={(d) => { setOpen(false); onChangeDays(d); }}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
