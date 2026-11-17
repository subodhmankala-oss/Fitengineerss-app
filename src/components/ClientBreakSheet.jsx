import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BREAK_REASONS, BREAK_REASON_KEYS, BREAK_LENGTHS, MAX_BREAK_DAYS, NOTE_MIN, NOTE_MAX,
  breakLengthLabel, formatBreakDate, daysBetween,
} from '../utils/clientBreaks';
import { getLocalDateString, shiftLocalDateString } from '../utils/dateUtils';
import { BreakReasonIcon } from './ClientBreakIcons';
import './ClientBreak.css';

const NOTE_PLACEHOLDER = {
  holiday: 'e.g. Family trip to Goa, back Monday',
  illness: 'e.g. Down with fever, resting this week',
  emergency: 'e.g. Family emergency, will update you',
  other: 'e.g. exams, work travel, moving house…',
};

// Profile → Taking a break (and "Extend" on the home card). The client picks
// a reason, how long, and writes a note to their coach. The note is
// required for every reason, so the coach always knows why.
//
// `existing`: the break running today, to change its reason / note / back
// date (the start date stays). Otherwise a new break starts today.
export default function ClientBreakSheet({ existing = null, hasCoach = true, onSave, onEnd, onClose }) {
  const today = getLocalDateString();
  const startDate = existing?.startDate || today;
  const [reason, setReason] = useState(existing?.reason || null);
  const [backDate, setBackDate] = useState(existing?.backDate || shiftLocalDateString(startDate, 5));
  const [picking, setPicking] = useState(() => !!existing && !BREAK_LENGTHS.includes(daysBetween(startDate, existing.backDate)));
  const [note, setNote] = useState(existing?.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const minBack = shiftLocalDateString(today, 1);
  const maxBack = shiftLocalDateString(startDate, MAX_BREAK_DAYS);
  const days = daysBetween(startDate, backDate);
  const noteOk = note.trim().length >= NOTE_MIN;
  const canSave = !!reason && noteOk && backDate >= minBack && backDate <= maxBack && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      await onSave(existing
        ? { id: existing.id, reason, note: note.trim(), backDate }
        : { reason, note: note.trim(), startDate, backDate });
      onClose();
    } catch (e) {
      setError(e.message || 'Could not save. Try again.');
      setSaving(false);
    }
  };

  const end = async () => {
    setSaving(true);
    setError('');
    try { await onEnd(existing.id); onClose(); } catch (e) { setError(e.message || 'Could not end your break.'); setSaving(false); }
  };

  const noteLabel = reason === 'other' ? (hasCoach ? 'Tell your coach why' : 'Why are you taking a break?') : (hasCoach ? 'Note to coach' : 'Note');

  return createPortal(
    <div className="cb-backdrop" onClick={onClose}>
      <div className="cb-sheet" role="dialog" aria-modal="true" aria-labelledby="cb-title" onClick={e => e.stopPropagation()}>
        <div className="cb-grip" aria-hidden="true" />
        <h3 id="cb-title" className="cb-title">{existing ? 'Your break' : 'Taking a break'}</h3>
        <p className="cb-sub">
          {hasCoach ? 'Your coach will be told. ' : ''}Your Training Level won't drop while you're away.
        </p>

        <div className="cb-label">Reason</div>
        <div className="cb-reasons" role="radiogroup" aria-label="Reason">
          {BREAK_REASON_KEYS.map(key => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={reason === key}
              className={`cb-reason${reason === key ? ' on' : ''}`}
              style={{ '--c': BREAK_REASONS[key].color, '--c-rgb': BREAK_REASONS[key].rgb }}
              onClick={() => setReason(key)}
            >
              <BreakReasonIcon reason={key} />
              {BREAK_REASONS[key].label}
            </button>
          ))}
        </div>

        <div className="cb-label">How long</div>
        <div className="cb-chips">
          {BREAK_LENGTHS.map(n => {
            const date = shiftLocalDateString(startDate, n);
            const tooShort = date < minBack;
            return (
              <button
                key={n}
                type="button"
                className={`cb-chip${!picking && days === n ? ' on' : ''}`}
                disabled={tooShort}
                onClick={() => { setPicking(false); setBackDate(date); }}
              >{breakLengthLabel(n)}</button>
            );
          })}
          <button type="button" className={`cb-chip${picking ? ' on' : ''}`} onClick={() => setPicking(true)}>Pick date</button>
        </div>
        {picking && (
          <label className="cb-date">
            <span>Back on</span>
            <input
              type="date"
              value={backDate}
              min={minBack}
              max={maxBack}
              onChange={e => e.target.value && setBackDate(e.target.value)}
            />
          </label>
        )}
        <div className="cb-until">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
          Back on <b>{formatBreakDate(backDate)}</b>
          {days > 0 && <span className="cb-until-days">· {breakLengthLabel(days)}</span>}
        </div>

        <label className="cb-label" htmlFor="cb-note">{noteLabel} <span className="cb-req" aria-hidden="true">*</span></label>
        <textarea
          id="cb-note"
          className={`cb-note${noteOk ? '' : ' empty'}`}
          rows={2}
          maxLength={NOTE_MAX}
          required
          value={note}
          placeholder={NOTE_PLACEHOLDER[reason] || 'A few words about why'}
          onChange={e => setNote(e.target.value)}
        />
        {!noteOk && (
          <div className="cb-hint">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 7v6M12 17h.01" /></svg>
            {hasCoach ? 'Add a short note so your coach knows' : 'Add a short note'}
          </div>
        )}

        {error && <div className="cb-error" role="alert">{error}</div>}

        <button type="button" className="cb-save" disabled={!canSave} onClick={save}>
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Start break'}
        </button>
        {existing && onEnd && (
          <button type="button" className="cb-end" disabled={saving} onClick={end}>I'm back, end my break</button>
        )}
      </div>
    </div>,
    document.body
  );
}
