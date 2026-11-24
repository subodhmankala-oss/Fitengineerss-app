import React, { useState } from 'react';
import SwipeToHide from './SwipeToHide';
import TrainingDayPicker from './TrainingDayPicker';
import { FullBodyThumbnail } from './MuscleAnalytics/MuscleThumbnail';
import { DAY_NAMES, dayIndexOf, shortProgramName } from '../utils/weekPlan';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './FirstWorkoutPicker.css';
import './WeekPlanCard.css';

// Heat-map tints: the muscles a workout mainly targets, and the ones it also
// works.
const HEAT_MAIN = '#ef4444';
const HEAT_ALSO = '#f59e0b';

const dayShort = (date) => DAY_NAMES[dayIndexOf(date)].slice(0, 3);
const dayNumber = (date) => Number(date.slice(8));
const slotKey = (slot) => `${slot.date}|${slot.program.name}`;

const PlayIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14z" /></svg>
);
const TickIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
);

// One day, full size: date · body heat map · workout · play (tick once done).
function DayRow({ slot, session, isMain, onStart }) {
  const { program, done, kcal, date, isToday } = slot;
  const label = done
    ? `${program.name}, done`
    : `Start ${program.name}${session.focus.length ? ` — ${session.focus.join(', ')}` : ''}`;
  return (
    <button
      type="button"
      className={`wpc-row ${isMain ? 'main' : ''}`}
      aria-label={label}
      disabled={done}
      onClick={() => onStart(program)}
    >
      <span className="wpc-date">
        <span className="wpc-date-day">{dayShort(date)}</span>
        <span className="wpc-date-num">{dayNumber(date)}</span>
        {isToday && <span className="wpc-date-today">Today</span>}
      </span>
      {session.muscles.length > 0 && (
        // --status-color tints the thumbnail's backdrop (.muscle-thumb).
        <span className="wpc-body">
          <FullBodyThumbnail
            trainedMuscles={session.muscles}
            view={session.view}
            size={60}
            colorFor={(m) => (session.main.has(m) ? HEAT_MAIN : HEAT_ALSO)}
          />
        </span>
      )}
      <span className="wpc-text">
        <span className="wpc-name">{shortProgramName(program.name)}</span>
        {done
          ? <span className="wpc-stats done">Done{kcal > 0 ? ` · ${kcal} kcal` : ''}</span>
          : <span className="wpc-stats">{session.minutes} min · {session.exerciseCount} exercise{session.exerciseCount === 1 ? '' : 's'}</span>}
      </span>
      <span className={`wpc-play ${done ? 'done' : isMain ? 'now' : ''}`} aria-hidden="true">
        {done ? <TickIcon size={20} /> : <PlayIcon size={20} />}
      </span>
    </button>
  );
}

// One of the other days, in the strip under the big card.
function SmallDay({ slot, onStart }) {
  const { program, done, kcal, date, isToday } = slot;
  return (
    <button
      type="button"
      className="wpc-small"
      aria-label={done ? `${program.name}, done` : `Start ${program.name}`}
      disabled={done}
      onClick={() => onStart(program)}
    >
      <span className="wpc-text">
        <span className="wpc-small-day">
          {isToday ? 'Today' : `${dayShort(date)} ${dayNumber(date)}`}{done && kcal > 0 ? ` · ${kcal} kcal` : ''}
        </span>
        <span className="wpc-small-name">{shortProgramName(program.name)}</span>
      </span>
      <span className={`wpc-play small ${done ? 'done' : ''}`} aria-hidden="true">
        {done ? <TickIcon size={16} /> : <PlayIcon size={15} />}
      </span>
    </button>
  );
}

/**
 * The self-guided client's week at the top of Home: today's workout (or the
 * next one) big, the week's other days in a strip underneath, each with its
 * own play button. Right after "Make my plan" (`justMade`) every day shows
 * full size instead. Swipe left to hide it for the week.
 *
 * plan: buildWeekPlan() · sessionFor(program): what the logger will build
 * (minutes, exercises, muscles) · note: replaces the level under the title.
 */
export default function WeekPlanCard({ plan, levelLabel, note, days, justMade = false, hintKey, sessionFor, onStart, onChangeDays, onHide }) {
  const [editDays, setEditDays] = useState(null); // null = not editing
  const { slots, main, doneCount, weekDone, nextWeek, nextProgram } = plan;

  if (editDays) {
    return (
      <section className="wpc wpc-edit" aria-label="Change your training days">
        <h3 className="fwp-question">
          Which days suit you?
          <span className="fwp-day-count">{editDays.length} day{editDays.length === 1 ? '' : 's'}</span>
        </h3>
        <TrainingDayPicker days={editDays} onChange={setEditDays} />
        <div className="wpc-edit-actions">
          <button type="button" className="wpc-cancel" onClick={() => setEditDays(null)}>Cancel</button>
          <button
            type="button"
            className="fwp-start"
            disabled={editDays.length === 0}
            onClick={() => { onChangeDays(editDays); setEditDays(null); }}
          >
            {editDays.length === 0 ? 'Pick your days' : 'Save days'}
          </button>
        </div>
      </section>
    );
  }

  const header = (
    <div className="wpc-head">
      <div>
        <h2 className="wpc-title">{nextWeek ? 'Next week' : 'Your week'}</h2>
        <p className="wpc-sub">{note ? <span className="wpc-note">{note}</span> : levelLabel}</p>
      </div>
      <button type="button" className="wpc-change" onClick={() => setEditDays(days)}>Change days</button>
    </div>
  );

  if (justMade) {
    return (
      <section className="wpc" aria-label="Your workout week">
        <p className="wpc-ready">Your plan is ready</p>
        {header}
        <div className="wpc-list">
          {slots.map(s => (
            <DayRow key={slotKey(s)} slot={s} session={sessionFor(s.program)} isMain={s === main} onStart={onStart} />
          ))}
        </div>
        <p className="wpc-foot">Feeling ready early? Press play on any card, any day.</p>
      </section>
    );
  }

  const others = slots.filter(s => s !== main);
  return (
    <section className="wpc" aria-label="Your workout week">
      {header}
      <SwipeToHide onHide={onHide} hintKey={hintKey} hideLabel="Hide this week">
        <div className="wpc-card">
          {weekDone ? (
            <div className="wpc-done">
              <span className="wpc-play done" aria-hidden="true"><TickIcon size={20} /></span>
              <span className="wpc-text">
                <span className="wpc-name">Week done, {doneCount} of {slots.length}</span>
                <span className="wpc-stats">Want more? {shortProgramName(nextProgram.name)} is next</span>
              </span>
              <button type="button" className="wpc-play" aria-label={`Start ${nextProgram.name}`} onClick={() => onStart(nextProgram)}>
                <PlayIcon size={20} />
              </button>
            </div>
          ) : (
            <>
              <DayRow slot={main} session={sessionFor(main.program)} isMain onStart={onStart} />
              {others.length > 0 && (
                <div className="wpc-strip">
                  {others.map(s => <SmallDay key={slotKey(s)} slot={s} onStart={onStart} />)}
                </div>
              )}
            </>
          )}
        </div>
      </SwipeToHide>
    </section>
  );
}
