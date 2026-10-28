import React, { useRef } from 'react';
import { getLocalDateString, parseLocalDateString } from '../utils/dateUtils';
import './DateBar.css';

const Chevron = ({ dir }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
  </svg>
);

/**
 * Day picker for the Daily tab (client and coach), styled like the Muscles
 * range bar: ‹ the date centred ›. Tapping the date opens the native date
 * picker (an invisible input sits under it). `value` is a YYYY-MM-DD string;
 * you can't step past today.
 */
const DateBar = ({ value, onChange }) => {
  const inputRef = useRef(null);
  const today = getLocalDateString();
  const date = parseLocalDateString(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const label = date.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }),
  }).replace(',', '');

  const step = (days) => {
    const d = parseLocalDateString(value);
    d.setDate(d.getDate() + days);
    const next = getLocalDateString(d);
    if (next <= today) onChange(next);
  };

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };

  return (
    <div className="date-bar">
      <button type="button" className="date-bar-step" onClick={() => step(-1)} aria-label="Previous day" title="Previous day">
        <Chevron dir="left" />
      </button>
      <button type="button" className="date-bar-label" onClick={openPicker} aria-label={`Pick a date, currently ${label}`}>
        {value === today ? `Today · ${label}` : label}
        <input ref={inputRef} type="date" value={value} max={today} onChange={(e) => e.target.value && onChange(e.target.value)} tabIndex={-1} aria-hidden="true" />
      </button>
      <button type="button" className="date-bar-step" onClick={() => step(1)} disabled={value >= today} aria-label="Next day" title={value >= today ? 'Already on today' : 'Next day'}>
        <Chevron dir="right" />
      </button>
    </div>
  );
};

export default DateBar;
