import React from 'react';

// Line icons (Tabler outline paths) for an insight row's tone badge.
const TONE_ICONS = {
  warn: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  good: 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M9 12l2 2 4-4',
  info: 'M3 12h1m8-9v1m8 8h1M5.6 5.6l.7.7m12.1-.7-.7.7M9 16a5 5 0 1 1 6 0 3.5 3.5 0 0 0-1 3 2 2 0 0 1-4 0 3.5 3.5 0 0 0-1-3M9.7 17h4.6',
  tip: 'M5 12h14M13 18l6-6M13 6l6 6',
};

// The generator prefixes its strings with ⚠ / ✅ / 💪; that prefix becomes
// the row's tone (and its coloured icon) instead of being shown as text.
const toneOf =(text) => {
  if (text.startsWith('⚠')) return 'warn';
  if (text.startsWith('✅') || text.startsWith('💪')) return 'good';
  return 'info';
};

const stripPrefix = (text) => text.replace(/^(⚠️?|✅|💪)\s*/u, '');

// Bold the muscle a line is about ("Hamstrings received zero sets…").
const withSubject = (text) => {
  const m = text.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)?)( (?:received|has|averaged|are) )/);
  if (!m) return text;
  return <><strong>{m[1]}</strong>{m[2]}{text.slice(m[0].length)}</>;
};

// One row shared by Insights and Tips: tinted icon badge + text.
export const InsightRow = ({ text, tone, index = 0 }) => (
  <div className={`insight-item tone-${tone}`} style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}>
    <span className="insight-icon">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={TONE_ICONS[tone]} />
      </svg>
    </span>
    <span>{withSubject(stripPrefix(text))}</span>
  </div>
);

export const InsightsEmpty = ({ children }) => (
  <div className="insight-list">
    <InsightRow text={children} tone="good" />
  </div>
);

// Purely presentational — `insights` is the already-generated, data-gated
// string list from generateWeeklyInsights(). Nothing here invents content.
//
// Content-only (no card wrapper/header) — this shares a single card with
// Progress Comparison and Personal Recommendations via a 3-way switcher
// in WeeklyMuscleAnalytics.jsx, so the wrapper/header live there.
const WeeklyInsights = ({ insights, period = 'week' }) => {
  if (insights.length === 0) {
    return <InsightsEmpty>{`Nothing to flag this ${period}. Keep it up.`}</InsightsEmpty>;
  }

  return (
    <div className="insight-list">
      {insights.map((text, i) => <InsightRow key={i} text={text} tone={toneOf(text)} index={i} />)}
    </div>
  );
};

export default WeeklyInsights;
