import React from 'react';

const TREND_META = {
  up: { arrow: 'M12 19V5M5 12l7-7 7 7', label: 'Improved', className: 'trend-up' },
  down: { arrow: 'M12 5v14M19 12l-7 7-7-7', label: 'Declined', className: 'trend-down' },
  flat: { arrow: 'M5 12h14', label: 'Same', className: 'trend-flat' },
};

// Same icons and hues as the header's stats strip, so "Volume" here reads
// as the same thing as "kg" up there.
const TILE_ICONS = {
  workouts: 'M11.5 21H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6M16 3v4M8 3v4M4 11h16M15 19l2 2 4-4',
  volume: 'M2 12h1M6 8H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zM9 12h6M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1zM18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M22 12h-1',
  sets: 'M12 4L4 8l8 4 8-4-8-4M4 12l8 4 8-4M4 16l8 4 8-4',
  balance: 'M7 20h10M6 6l6-1 6 1M12 3v17M9 12L6 6l-3 6a3 3 0 0 0 6 0M21 12l-3-6-3 6a3 3 0 0 0 6 0',
};

const Icon = ({ d, size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ComparisonTile = ({ label, icon, color, curr, prev, trend, unit = '', pctChange = null, prevLabel = 'last week' }) => {
  const meta = TREND_META[trend] || TREND_META.flat;
  return (
    <div className="comparison-tile" style={{ '--tile-color': color }}>
      <span className="comparison-label"><Icon d={TILE_ICONS[icon]} />{label}</span>
      <span className="comparison-curr">{curr.toLocaleString('en-IN')}{unit}</span>
      <span className="comparison-prev">vs {prev.toLocaleString('en-IN')}{unit} {prevLabel}</span>
      <span className={`comparison-trend ${meta.className}`} title={meta.label}>
        <Icon d={meta.arrow} size={12} />
        {pctChange != null ? `${pctChange > 0 ? '+' : ''}${pctChange}%` : meta.label}
      </span>
    </div>
  );
};

/**
 * Section 7 — This Week vs Previous Week, as a 2×2 grid of tiles. `comparison`
 * is compareWeeks()'s output; `balanceTrend` is a separately-computed {curr,
 * prev, trend, pctChange} using getAverageCompletion() for both weeks (see
 * WeeklyMuscleAnalytics.jsx — deliberately NOT a claim about actual muscle
 * growth, since this app has no strength/hypertrophy data to back that).
 *
 * Content-only (no card wrapper/header) — this shares a single card with
 * Weekly Insights and Personal Recommendations via a 3-way switcher in
 * WeeklyMuscleAnalytics.jsx, so the wrapper/header live there.
 */
const ProgressComparison = ({ comparison, balanceTrend, prevLabel = 'last week' }) => {
  return (
    <div className="comparison-grid">
      <ComparisonTile label="Workouts" icon="workouts" color="var(--tint-amber)" curr={comparison.workouts.workouts} prev={comparison.prevWeek.workouts} trend={comparison.workouts.trend} prevLabel={prevLabel} />
      <ComparisonTile label="Volume" icon="volume" color="var(--tint-violet)" curr={comparison.volume.curr} prev={comparison.volume.prev} trend={comparison.volume.trend} unit=" kg" pctChange={comparison.volume.pctChange} prevLabel={prevLabel} />
      <ComparisonTile label="Sets" icon="sets" color="var(--tint-blue)" curr={comparison.sets.curr} prev={comparison.sets.prev} trend={comparison.sets.trend} pctChange={comparison.sets.pctChange} prevLabel={prevLabel} />
      <ComparisonTile label="Balance" icon="balance" color="#10b981" curr={balanceTrend.curr} prev={balanceTrend.prev} trend={balanceTrend.trend} unit="%" pctChange={balanceTrend.pctChange} prevLabel={prevLabel} />
    </div>
  );
};

export default ProgressComparison;
