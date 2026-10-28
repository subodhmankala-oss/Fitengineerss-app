import React from 'react';
import { useCountUp } from '../hooks/useCountUp';
import './StatsStrip.css';

// Line icons (Tabler outline paths) for the strip's unit labels.
const ICONS = {
  volume: 'M2 12h1M6 8H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zM9 12h6M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1zM18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M22 12h-1',
  sets: 'M12 4L4 8l8 4 8-4-8-4M4 12l8 4 8-4M4 16l8 4 8-4',
  workouts: 'M11.5 21H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6M16 3v4M8 3v4M4 11h16M15 19l2 2 4-4',
  exercises: 'M9 6h11M9 12h11M9 18h11M5 6v.01M5 12v.01M5 18v.01',
  kcal: 'M12 12c2-2.96 0-7-1-8 0 3.04-1.77 4.74-3 6-1.23 1.26-2 3.24-2 5a6 6 0 1 0 12 0c0-1.53-1.06-3.94-2-5-1.79 3-2.79 3-4 2z',
  month: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM16 3v4M8 3v4M4 11h16M8 15h2v2H8z',
  recovery: 'M6 7h11a2 2 0 0 1 2 2v.5a.5.5 0 0 0 .5.5.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5.5.5 0 0 0-.5.5v.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2M7 10v4M10 10v4',
};

// The usual hue per stat, so "sets" is the same blue on every tab.
const STAT_COLORS = {
  volume: 'var(--tint-violet)',
  sets: 'var(--tint-blue)',
  workouts: 'var(--tint-amber)',
  exercises: 'var(--tint-amber)',
  kcal: 'var(--tint-orange)',
  month: 'var(--tint-cyan)',
  recovery: '#10b981',
};

const Cell = ({ value, text, label, icon, color, suffix = '' }) => {
  const animated = useCountUp(value ?? 0);
  // Muscle set counts can be halves (9.5): keep one decimal for those.
  const shown = Number.isInteger(value ?? 0)
    ? Math.round(animated).toLocaleString('en-IN')
    : (Math.round(animated * 10) / 10).toLocaleString('en-IN');
  return (
    <div className="stats-strip-item" style={{ '--stat-color': color || STAT_COLORS[icon] }}>
      <strong>{text ?? `${shown}${suffix}`}</strong>
      <span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={ICONS[icon]} />
        </svg>
        {label}
      </span>
    </div>
  );
};

/**
 * Stats in one soft panel split by hairlines: number on top, a tinted icon +
 * unit below. Shared by the Muscles header and the Daily/Monthly tabs
 * (client and coach). `items`: [{ icon, label, value }] — a numeric `value`
 * counts up (with an optional `suffix`, e.g. "%"); pass `text` instead for a
 * preformatted value. Keep it to four
 * items: a fifth squeezes the labels into each other on a phone.
 */
const StatsStrip = ({ items, className = '' }) => (
  <div className={`stats-strip${className ? ` ${className}` : ''}`} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
    {items.map(item => <Cell key={item.label} {...item} />)}
  </div>
);

export default StatsStrip;
