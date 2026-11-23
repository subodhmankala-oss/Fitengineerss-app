import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseLocalDateString } from '../utils/dateUtils';
import './WorkoutHeadLine.css';

// Top line of the logger card (client logger and coach Live Log): the workout
// name on the left, the date on the right, with the timer bar as the card's
// second line. Tapping the name opens a sheet with the name box and every
// plan that can be loaded; the date is a real date input laid invisibly over
// its text, so tapping it opens the phone's own picker.
// `groups` = [{ label, items: [{ id, name, meta }] }]; empty groups are
// skipped. `sheet` is null, 'open', or 'missing' (Save was pressed without a
// name: the box is focused and says so). `hasTicked` = loading a plan would
// throw ticked sets away, so a row asks first. `clientName` (coach only) sits
// before the date, so it's always clear whose workout this is.
export default function WorkoutHeadLine({
  name, onNameChange, date, onDateChange, clientName,
  groups, onPick, hasTicked, sheet, onSheet,
}) {
  const shown = (name || '').trim();
  const day = date ? parseLocalDateString(date) : null;
  return (
    <div className="wh-line" data-testid="workout-head">
      <button type="button" className="wh-name" aria-haspopup="dialog" title="Name and plans" onClick={() => onSheet('open')}>
        <span className={shown ? undefined : 'is-empty'}>{shown || 'Name this workout'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <label className="wh-date" title="Change date">
        {clientName && <span className="wh-client">{clientName}</span>}
        {clientName && <span aria-hidden="true">·</span>}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
        <span className="wh-day">
          {day ? day.toLocaleDateString('en-GB', { weekday: clientName ? undefined : 'short', day: 'numeric', month: 'short' }).replace(',', '') : 'Date'}
        </span>
        <input type="date" value={date} required aria-label="Workout date" onChange={e => e.target.value && onDateChange(e.target.value)} />
      </label>
      {sheet && (
        <NameSheet name={name} onNameChange={onNameChange} groups={groups} onPick={onPick}
          hasTicked={hasTicked} missing={sheet === 'missing'} onClose={() => onSheet(null)} />
      )}
    </div>
  );
}

function NameSheet({ name, onNameChange, groups, onPick, hasTicked, missing, onClose }) {
  const inputRef = useRef(null);
  // The plan row waiting for a second tap (sets are already ticked).
  const [confirmId, setConfirmId] = useState(null);

  // No name yet: straight into typing one. With a name the keyboard stays
  // down, so the plan list is in view.
  const [startEmpty] = useState(!(name || '').trim());
  useEffect(() => { if (missing || startEmpty) inputRef.current?.focus(); }, [missing, startEmpty]);
  // The loggers re-render every second and pass a new onClose each time.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = id => {
    if (hasTicked && confirmId !== id) { setConfirmId(id); return; }
    onPick(id);
    onClose();
  };
  const empty = missing && !(name || '').trim();

  return createPortal(
    <div className="wh-root" role="dialog" aria-modal="true" aria-label="Workout name and plans">
      <div className="wh-backdrop" onClick={onClose} />
      <div className="wh-sheet">
        <div className="wh-sheet-head">
          <label htmlFor="workoutNameInputTop">Workout name</label>
          <button type="button" className="wh-done" onClick={onClose}>Done</button>
        </div>
        <div className={`wh-field${empty ? ' is-missing' : ''}`}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20l1-4L16 5l3 3L8 19l-4 1zM13.5 7.5l3 3" /></svg>
          <input
            id="workoutNameInputTop"
            ref={inputRef}
            type="text"
            aria-invalid={empty || undefined}
            placeholder="Type your own name"
            enterKeyHint="done"
            maxLength={60}
            value={name}
            onChange={e => onNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onClose(); } }}
          />
          {name && (
            <button type="button" className="wh-clear" aria-label="Clear name" onClick={() => { onNameChange(''); inputRef.current?.focus(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>
        {empty && <p className="wh-missing" role="alert">Add a name, then press Save again.</p>}
        <div className="wh-or">Or load a plan</div>
        <div className="wh-groups">
          {groups.filter(g => g.items.length > 0).map(g => (
            <section key={g.label} aria-label={g.label}>
              <h4>{g.label}</h4>
              {g.items.map(p => (
                <button key={p.id} type="button" className="wh-row" onClick={() => pick(p.id)}>
                  <span className="wh-row-name">{p.name}</span>
                  {confirmId === p.id
                    ? <span className="wh-row-ask">Clears your ticked sets. Tap again to load.</span>
                    : p.meta && <span className="wh-row-meta">{p.meta}</span>}
                </button>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
