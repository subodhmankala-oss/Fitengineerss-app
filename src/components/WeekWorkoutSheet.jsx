import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TrainingDayPicker from './TrainingDayPicker';
import { FullBodyThumbnail } from './MuscleAnalytics/MuscleThumbnail';
import { DAY_NAMES, dayIndexOf } from '../utils/weekPlan';
import './FirstWorkoutPicker.css';
import './WeekWorkoutSheet.css';

const CLOSE_AFTER = 90; // px dragged down before letting go closes it

const Icon = ({ path, size = 16, width = 2.4 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
);
const TICK = 'M20 6 9 17l-5-5';
const PLUS = 'M12 5v14M5 12h14';

const dayName = (date) => DAY_NAMES[dayIndexOf(date)];
const dayNumber = (date) => Number(date.slice(8));

function Row({ mark, name, amount, tag, added }) {
  return (
    <li className="wws-row">
      {mark
        ? <span className={`wws-mark ${added ? 'added' : ''}`}>{mark}</span>
        : <span className="wws-mark done"><Icon path={TICK} size={13} width={3.2} /></span>}
      <span className="wws-ex">
        <span className="wws-ex-name">{name}</span>
        {tag && <span className={`wws-tag ${added ? 'added' : ''}`}>{tag}</span>}
      </span>
      <span className="wws-amount">{amount}</span>
    </li>
  );
}

/**
 * The full workout, slid up from the bottom when Home's workout card is
 * tapped (WeekPlanCard): the week's days across the top (green with a tick
 * once saved), then that day's warm-up and exercises as the logger will
 * build them — or, for a done one, what was saved. Drag the top down, tap
 * outside or press Escape to close.
 *
 * entries: the week's slots, plus the next workout of a finished week
 * (no date) · heat: { main, also } tints for the body figure.
 */
export default function WeekWorkoutSheet({ entries, initialIndex, levelLabel, note, days, heat, sessionFor, loggedFor, onStart, onChangeDays, onClose }) {
  const [at, setAt] = useState(Math.max(0, initialIndex));
  const [editDays, setEditDays] = useState(null); // null = not editing
  const [drag, setDrag] = useState(0);
  const dragFrom = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPointerDown = (e) => {
    if (e.target.closest('button')) return;
    dragFrom.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (dragFrom.current !== null) setDrag(Math.max(0, e.clientY - dragFrom.current));
  };
  const onPointerUp = (e) => {
    if (dragFrom.current === null) return;
    const moved = e.clientY - dragFrom.current;
    dragFrom.current = null;
    setDrag(0);
    if (e.type === 'pointerup' && moved > CLOSE_AFTER) onClose();
  };

  // The week can get shorter while this is open (a save on another device).
  const index = Math.min(at, entries.length - 1);
  const slot = entries[index];
  const { program, done, kcal, date, isToday } = slot;
  const session = sessionFor(slot);
  const when = date ? `${dayName(date).slice(0, 3)} ${dayNumber(date)}${isToday ? ' · Today' : ''}` : 'Next workout';

  return createPortal(
    <div className="wws-root" role="dialog" aria-modal="true" aria-label={editDays ? 'Change your training days' : program.name}>
      <div className="wws-backdrop" onClick={onClose} />
      <div className={`wws-sheet ${editDays ? '' : 'tall'}`} style={drag ? { transform: `translateY(${drag}px)`, animation: 'none' } : undefined}>
        <div className="wws-top" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="wws-grip" aria-hidden="true" />
          {!editDays && entries.length > 1 && (
            <div className="wws-days" role="group" aria-label="This week">
              {entries.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={i === index}
                  aria-label={`${s.date ? dayName(s.date) : 'Next'}, ${s.program.name}${s.done ? ', done' : ''}`}
                  className={`wws-day ${s.done ? 'done' : ''} ${i === index ? 'on' : ''}`}
                  onClick={() => setAt(i)}
                >
                  <span>{s.date ? dayName(s.date).slice(0, 3) : 'Next'}</span>
                  <b>{s.done ? <Icon path={TICK} width={3.2} /> : s.date ? dayNumber(s.date) : <Icon path={PLUS} />}</b>
                </button>
              ))}
            </div>
          )}
          {!editDays && (
            <div className="wws-head">
              {session.muscles.length > 0 && (
                <span className="wws-body">
                  <FullBodyThumbnail
                    trainedMuscles={session.muscles}
                    view={session.view}
                    size={78}
                    colorFor={(m) => (session.main.has(m) ? heat.main : heat.also)}
                  />
                </span>
              )}
              <div className="wws-title-box">
                <p className="wws-when">{when}</p>
                <h3 className="wws-title">{program.name}</h3>
                {done
                  ? <p className="wws-meta done">Done{kcal > 0 ? ` · ${Math.round(kcal)} kcal` : ''}</p>
                  : <p className="wws-meta">{session.minutes} min · {session.exerciseCount} exercise{session.exerciseCount === 1 ? '' : 's'} · {session.setCount} sets</p>}
                {note && !done && <p className="wws-meta done">{note}</p>}
              </div>
            </div>
          )}
        </div>

        {editDays ? (
          <div className="wws-edit">
            <h3 className="fwp-question">
              Which days suit you?
              <span className="fwp-day-count">{editDays.length} day{editDays.length === 1 ? '' : 's'}</span>
            </h3>
            <TrainingDayPicker days={editDays} onChange={setEditDays} />
            <div className="wws-edit-actions">
              <button type="button" className="wws-link muted" onClick={() => setEditDays(null)}>Cancel</button>
              <button type="button" className="fwp-start" disabled={editDays.length === 0} onClick={() => onChangeDays(editDays)}>
                {editDays.length === 0 ? 'Pick your days' : 'Save days'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Keyed: another day starts at the top of its list. */}
            <div className="wws-scroll" key={index}>
              {!done && session.warmups.length > 0 && (
                <div className="wws-warm">
                  <p className="wws-warm-title">Warm-up, about 5 min</p>
                  <p className="wws-warm-list">{session.warmups.map(w => w.name).join(' · ')}</p>
                </div>
              )}
              <ol className="wws-list">
                {done
                  ? loggedFor(slot).map(e => <Row key={e.name} name={e.name} amount={e.amount} />)
                  : session.exercises.map((e, i) => <Row key={i} mark={i + 1} name={e.name} amount={e.amount} tag={e.tag} added={e.added} />)}
                {!done && session.finisherLater > 0 && (
                  <Row mark={<Icon path={PLUS} size={13} width={3} />} name="Neglected muscle" amount={`${session.finisherLater} sets`} tag="Picked on the day" added />
                )}
              </ol>
              <div className="wws-foot">
                <span>{levelLabel}</span>
                <button type="button" className="wws-link" onClick={() => setEditDays(days)}>Change days</button>
              </div>
            </div>
            {!done && (
              <div className="wws-action">
                <button type="button" className="wws-start" onClick={() => onStart(slot)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14z" /></svg>
                  Start workout
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
