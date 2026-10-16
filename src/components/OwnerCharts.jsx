import React, { useState } from 'react';
import { DAYS, DAY_SHORT, OWNER_STATUS, RAMP, TIME_BLOCKS, blockCounts, busiestSummary, plural } from '../utils/ownerView';

// Charts for the gym owner's My Gym (OwnerGymDashboard) and the member /
// trainer profiles. Plain HTML, no chart library: thin bars with rounded
// tops on a baseline, one hue, a recessive grid, a number on every bar with
// workouts (these charts have 8–12 bars of small counts, and an owner asked
// "what is the 2?" when only the highest bar had one), a readout line that
// follows hover / focus / tap (so it works on a phone), and a "Show as
// table" view. Weeks read as ranges ("22–28 Aug"), never as a bare date.
// Colours come from the app's theme tokens so light and dark both work.

const muted = { fontSize: '0.74rem', color: 'var(--text-muted)' };
const linkButton = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-text)'
};

// ─── Status (member health) ───
// Green / blue / amber / red are the reserved status colours; each always
// appears with its text label, never colour alone.
export function StatusChip({ status }) {
  const s = OWNER_STATUS[status] || OWNER_STATUS.steady;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', fontWeight: 700,
      color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '999px',
      padding: '2px 8px', whiteSpace: 'nowrap', background: 'rgba(var(--fg-rgb), 0.03)'
    }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  );
}

// ─── Bars over weeks ───
const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1);

export function WeeklyBars({ values, labels, ranges = null, secondary = null, unit = 'workouts', secondaryUnit = 'members', height = 124, labelEvery = 2, beforeCount = 0, title }) {
  const [active, setActive] = useState(null);
  const [table, setTable] = useState(false);
  const last = values.length - 1;
  const shown = active === null ? last : active;
  const max = Math.max(1, ...values);
  const plot = height - 20; // room for the value label above the tallest bar
  const rangeOf = (i) => (ranges ? ranges[i] : labels[i]);
  const isBefore = (i) => i < beforeCount;
  const labelAll = values.length <= 12;

  return (
    <div>
      <div
        role="group"
        aria-label={title || `${unit} per week`}
        style={{ position: 'relative', height, display: 'flex', alignItems: 'flex-end', gap: '6px', borderBottom: '1px solid var(--border-color)' }}
        onMouseLeave={() => setActive(null)}
      >
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: `${plot / 2}px`, borderTop: '1px dashed rgba(var(--fg-rgb), 0.1)' }} />
        {values.map((v, i) => {
          const before = isBefore(i);
          const barH = v > 0 ? Math.max(4, Math.round((v / max) * plot)) : 2;
          const emphasised = i === shown;
          const showValue = !before && v > 0 && (labelAll || i === last || i === shown);
          return (
            <button
              key={i}
              type="button"
              aria-label={before
                ? `${rangeOf(i)}: before they joined`
                : `${rangeOf(i)}: ${plural(v, unit)}${secondary ? `, ${plural(secondary[i], secondaryUnit)}` : ''}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(i)}
              style={{
                flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', position: 'relative', zIndex: 1
              }}
            >
              {showValue && (
                <span style={{ fontSize: '0.66rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '3px', lineHeight: 1 }}>{v}</span>
              )}
              {before ? (
                <span aria-hidden="true" style={{ width: '60%', maxWidth: '22px', height: 0, borderTop: '2px dotted rgba(var(--fg-rgb), 0.25)' }} />
              ) : (
                <span style={{
                  width: '72%', maxWidth: '28px', height: `${barH}px`, borderRadius: '4px 4px 0 0',
                  background: v > 0 ? 'rgb(var(--accent-rgb))' : 'rgba(var(--fg-rgb), 0.12)',
                  opacity: v > 0 ? (emphasised ? 1 : 0.55) : 1,
                  transition: 'opacity 0.15s ease'
                }} />
              )}
            </button>
          );
        })}
      </div>

      <div aria-hidden="true" style={{ display: 'flex', gap: '6px', marginTop: '5px' }}>
        {labels.map((l, i) => (
          <span key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: '0.6rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'visible' }}>
            {(last - i) % labelEvery === 0 ? l : ''}
          </span>
        ))}
      </div>

      <div style={{ ...muted, fontSize: '0.66rem', marginTop: '4px' }}>
        Each bar is one week, labelled by its first day{beforeCount ? '. A dotted line means they hadn’t joined yet.' : '.'}
      </div>

      <div style={{ ...muted, marginTop: '8px', minHeight: '1.2em' }} aria-live="polite">
        <strong style={{ color: 'var(--text-main)' }}>{rangeOf(shown)}</strong>
        {' · '}
        {isBefore(shown) ? 'Before they joined' : plural(values[shown], unit)}
        {secondary && !isBefore(shown) ? ` · ${plural(secondary[shown], secondaryUnit)}` : ''}
      </div>

      <button type="button" style={{ ...linkButton, marginTop: '6px' }} onClick={() => setTable((t) => !t)}>
        {table ? 'Hide table' : 'Show as table'}
      </button>
      {table && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6px', fontSize: '0.74rem', color: 'var(--text-main)' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '3px 4px', fontWeight: 600 }}>Week</th>
              <th style={{ padding: '3px 4px', fontWeight: 600 }}>{capitalise(unit)}</th>
              {secondary && <th style={{ padding: '3px 4px', fontWeight: 600 }}>{capitalise(secondaryUnit)}</th>}
            </tr>
          </thead>
          <tbody>
            {values.map((v, i) => (
              <tr key={i} style={{ borderTop: '1px solid rgba(var(--fg-rgb), 0.06)' }}>
                <td style={{ padding: '3px 4px' }}>{rangeOf(i)}</td>
                <td style={{ padding: '3px 4px' }} colSpan={isBefore(i) && secondary ? 2 : 1}>{isBefore(i) ? 'Before they joined' : v}</td>
                {secondary && !isBefore(i) && <td style={{ padding: '3px 4px' }}>{secondary[i]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── When members train ───
export function PeakGrid({ grid }) {
  const cells = blockCounts(grid);
  const max = Math.max(1, ...cells.flat());
  const level = (n) => (n === 0 ? 0 : Math.min(RAMP.length - 1, Math.ceil((n / max) * RAMP.length) - 1));
  const summary = busiestSummary(grid);

  return (
    <div>
      {summary && <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>{summary}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(6, minmax(0, 1fr))', gap: '2px', alignItems: 'center' }} role="table" aria-label="When members train, by day and time">
        <span />
        {TIME_BLOCKS.map((b) => (
          <span key={b.label} style={{ fontSize: '0.58rem', textAlign: 'center', color: 'var(--text-muted)', lineHeight: 1.2 }}>{b.label}</span>
        ))}
        {cells.map((row, d) => (
          <React.Fragment key={DAYS[d]}>
            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)' }}>{DAY_SHORT[d]}</span>
            {row.map((n, b) => {
              const lv = level(n);
              return (
                <span
                  key={b}
                  role="cell"
                  title={`${DAYS[d]} ${TIME_BLOCKS[b].range}: ${n} workout${n === 1 ? '' : 's'}`}
                  aria-label={`${DAYS[d]} ${TIME_BLOCKS[b].range}: ${n} workouts`}
                  style={{
                    height: '26px', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.64rem', fontWeight: 800,
                    background: n === 0 ? 'rgba(var(--fg-rgb), 0.04)' : `rgba(var(--accent-rgb), ${RAMP[lv]})`,
                    color: lv >= 3 ? '#fff' : 'var(--text-main)'
                  }}
                >
                  {n > 0 ? n : ''}
                </span>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', ...muted, fontSize: '0.66rem' }}>
        Fewer
        {RAMP.map((a) => <span key={a} style={{ width: 16, height: 10, borderRadius: 3, background: `rgba(var(--accent-rgb), ${a})` }} />)}
        More
      </div>
    </div>
  );
}

// ─── Member health: a stacked bar with a labelled legend ───
const HEALTH_ORDER = ['thriving', 'steady', 'slipping', 'quiet', 'inactive', 'new'];

export function HealthBar({ health, onSelect }) {
  const total = HEALTH_ORDER.reduce((s, k) => s + (health[k] || 0), 0);
  if (total === 0) return <div style={muted}>Members appear here once they join.</div>;
  return (
    <div>
      <div role="img" aria-label={HEALTH_ORDER.filter((k) => health[k]).map((k) => `${health[k]} ${OWNER_STATUS[k].label}`).join(', ')}
        style={{ display: 'flex', gap: '2px', height: '12px' }}>
        {HEALTH_ORDER.filter((k) => health[k] > 0).map((k) => (
          <span key={k} title={`${OWNER_STATUS[k].label}: ${health[k]}`}
            style={{ flex: health[k], background: OWNER_STATUS[k].color, borderRadius: '3px', minWidth: '6px' }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: '10px' }}>
        {HEALTH_ORDER.filter((k) => health[k] > 0).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onSelect && onSelect(k)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', padding: 0, cursor: onSelect ? 'pointer' : 'default', fontFamily: 'inherit', color: 'var(--text-main)', fontSize: '0.78rem' }}
          >
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: OWNER_STATUS[k].color }} />
            <strong>{health[k]}</strong> {OWNER_STATUS[k].label}
          </button>
        ))}
      </div>
    </div>
  );
}
