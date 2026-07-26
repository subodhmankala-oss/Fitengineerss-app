import React from 'react';

const TREND_META = {
  up: { arrow: '↑', label: 'Improved', className: 'trend-up' },
  down: { arrow: '↓', label: 'Declined', className: 'trend-down' },
  flat: { arrow: '=', label: 'Maintained', className: 'trend-flat' },
};

const ComparisonRow = ({ label, curr, prev, trend, unit = '', pctChange = null }) => {
  const meta = TREND_META[trend] || TREND_META.flat;
  return (
    <div className="comparison-row">
      <span className="comparison-label">{label}</span>
      <div className="comparison-values">
        <span className="comparison-curr">{curr.toLocaleString('en-IN')}{unit}</span>
        <span className="comparison-prev">vs {prev.toLocaleString('en-IN')}{unit} last week</span>
      </div>
      <span className={`comparison-trend ${meta.className}`}>
        {meta.arrow} {meta.label}{pctChange != null ? ` (${pctChange > 0 ? '+' : ''}${pctChange}%)` : ''}
      </span>
    </div>
  );
};

/**
 * Section 7 — This Week vs Previous Week. `comparison` is compareWeeks()'s
 * output; `balanceTrend` is a separately-computed {curr, prev, trend,
 * pctChange} using getAverageCompletion() for both weeks (see
 * WeeklyMuscleAnalytics.jsx — deliberately NOT a claim about actual muscle
 * growth, since this app has no strength/hypertrophy data to back that).
 *
 * Content-only (no card wrapper/header) — this shares a single card with
 * Weekly Insights and Personal Recommendations via a 3-way tab switcher in
 * WeeklyMuscleAnalytics.jsx, so the wrapper/header live there.
 */
const ProgressComparison = ({ comparison, balanceTrend }) => {
  return (
    <div className="comparison-list">
      <ComparisonRow label="Workout Count" curr={comparison.workouts.workouts} prev={comparison.prevWeek.workouts} trend={comparison.workouts.trend} />
      <ComparisonRow label="Training Volume" curr={comparison.volume.curr} prev={comparison.volume.prev} trend={comparison.volume.trend} unit=" kg" pctChange={comparison.volume.pctChange} />
      <ComparisonRow label="Total Sets" curr={comparison.sets.curr} prev={comparison.sets.prev} trend={comparison.sets.trend} pctChange={comparison.sets.pctChange} />
      <ComparisonRow label="Balance Trend" curr={balanceTrend.curr} prev={balanceTrend.prev} trend={balanceTrend.trend} unit="%" pctChange={balanceTrend.pctChange} />
    </div>
  );
};

export default ProgressComparison;
