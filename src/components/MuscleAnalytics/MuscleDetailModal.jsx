import React, { useMemo, useState } from 'react';
import { useCountUp } from '../../hooks/useCountUp';
import { shiftLocalDateString, getLocalDateString } from '../../utils/dateUtils';
import {
  getWeeklyMuscleStats, getExerciseBreakdownForMuscle, getBestLiftForMuscle,
  getPersonalRecordsForMuscle, getWeeklySetsTrendForMuscle, getMuscleGrowthScore,
  getMuscleRecovery, getHeatMapTier
} from '../../utils/muscleAnalytics';

const MUSCLE_ABBREV = {
  Chest: 'CH', Back: 'BA', Shoulders: 'SH', Biceps: 'BI', Triceps: 'TR',
  Forearms: 'FA', Core: 'CO', Glutes: 'GL', Quads: 'QD', Hamstrings: 'HS', Calves: 'CA'
};

const StatBlock = ({ label, value, suffix = '' }) => {
  const animated = useCountUp(typeof value === 'number' ? value : 0, 700);
  return (
    <div className="detail-stat-block">
      <span className="detail-stat-label">{label}</span>
      <strong className="detail-stat-value">
        {typeof value === 'number' ? `${Math.round(animated).toLocaleString('en-IN')}${suffix}` : value}
      </strong>
    </div>
  );
};

// Compact hand-rolled SVG bar chart — matches the app's existing convention
// of inline SVG charts (see WorkoutProgressDashboard's weekly/monthly charts)
// rather than pulling in a charting library for one small sparkline.
const TrendSparkline = ({ weeks }) => {
  const width = 280, height = 70, barGap = 6;
  const barWidth = (width - barGap * (weeks.length - 1)) / weeks.length;
  const maxSets = Math.max(1, ...weeks.map(w => w.sets));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="detail-trend-svg" role="img" aria-label="Weekly sets trend, last 6 weeks">
      {weeks.map((w, i) => {
        const barHeight = Math.max(2, (w.sets / maxSets) * (height - 16));
        const x = i * (barWidth + barGap);
        const y = height - barHeight;
        const isLatest = i === weeks.length - 1;
        return (
          <g key={w.weekStart}>
            <rect x={x} y={y} width={barWidth} height={barHeight} rx={3} fill={isLatest ? 'var(--primary-accent-light)' : 'rgba(148,163,184,0.35)'} />
            <text x={x + barWidth / 2} y={height - barHeight - 4} textAnchor="middle" className="detail-trend-label">{w.sets}</text>
          </g>
        );
      })}
    </svg>
  );
};

/**
 * Section 9 — Muscle Detail Screen. Implemented as a bottom-sheet overlay
 * (not a new route/screen) — this app has no URL router, only tab state, so
 * a modal keeps the interaction native to how every other detail view here
 * already works (ExercisePickerModal, Form Guide sheet, payment modal).
 * Opened by tapping a Section 1 card or a Section 2 heat map region.
 */
const MuscleDetailModal = ({ muscle, logs, onClose }) => {
  const now = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => getLocalDateString(now), [now]);
  const weekStart = useMemo(() => shiftLocalDateString(todayStr, -6), [todayStr]);
  const monthStart = useMemo(() => shiftLocalDateString(todayStr, -29), [todayStr]);

  // getWeeklyMuscleStats is a generic range aggregator despite its name —
  // reused here with a 30-day window for "Monthly Sets" (see muscleAnalytics.js).
  const weeklyStat = useMemo(() => getWeeklyMuscleStats(logs, weekStart, todayStr).find(m => m.muscle === muscle), [logs, weekStart, todayStr, muscle]);
  const monthlyStat = useMemo(() => getWeeklyMuscleStats(logs, monthStart, todayStr).find(m => m.muscle === muscle), [logs, monthStart, todayStr, muscle]);
  const breakdown = useMemo(() => getExerciseBreakdownForMuscle(logs, muscle, weekStart, todayStr), [logs, muscle, weekStart, todayStr]);
  const bestLift = useMemo(() => getBestLiftForMuscle(logs, muscle), [logs, muscle]);
  const personalRecords = useMemo(() => getPersonalRecordsForMuscle(logs, muscle, 3), [logs, muscle]);
  const trend = useMemo(() => getWeeklySetsTrendForMuscle(logs, muscle, 6, now), [logs, muscle, now]);
  const growth = useMemo(() => getMuscleGrowthScore(logs, muscle, now), [logs, muscle, now]);
  const recovery = useMemo(() => getMuscleRecovery(logs, muscle, now), [logs, muscle, now]);

  // Closing is animated: the sheet slides back down and the backdrop fades
  // out BEFORE the parent unmounts this component (the parent just does
  // `{selectedMuscle && <MuscleDetailModal .../>}`, which would otherwise
  // remove it instantly with no exit transition). 260ms matches the CSS
  // close-animation duration below.
  const [isClosing, setIsClosing] = useState(false);
  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(onClose, 260);
  };

  if (!muscle || !weeklyStat) return null;
  const tier = getHeatMapTier(weeklyStat);

  return (
    <div className={`muscle-detail-backdrop ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div className={`muscle-detail-sheet ${isClosing ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="muscle-detail-handle" />

        <div className="muscle-detail-header">
          <span className="muscle-detail-icon" style={{ '--status-color': tier.color }}>
            {MUSCLE_ABBREV[muscle] || muscle.slice(0, 2).toUpperCase()}
          </span>
          <div className="muscle-detail-title-group">
            <h3>{muscle}</h3>
            <span className="muscle-status-pill" style={{ color: tier.color }}>{tier.label} this week</span>
          </div>
          <button type="button" className="muscle-detail-close" onClick={handleClose} aria-label="Close">✕</button>
        </div>

        <div className="muscle-detail-body">
          <div className="detail-stat-grid">
            <StatBlock label="Weekly Sets" value={weeklyStat.sets} />
            <StatBlock label="Monthly Sets" value={monthlyStat ? monthlyStat.sets : weeklyStat.sets} />
            <StatBlock label="Weekly Volume" value={weeklyStat.volume} suffix=" kg" />
            <StatBlock label="Recovery" value={recovery ? recovery.percent : 'N/A'} suffix={recovery ? '%' : ''} />
          </div>

          {recovery && (
            <p className="detail-meta-line">Last trained {recovery.hoursSince < 24 ? `${recovery.hoursSince}h ago` : `${Math.floor(recovery.hoursSince / 24)}d ago`} · {recovery.bucket.label}</p>
          )}

          {/* Progress Trend */}
          <div className="detail-section">
            <span className="detail-section-title">Progress Trend (last 6 weeks)</span>
            <TrendSparkline weeks={trend} />
          </div>

          {/* Exercises + Exercise Contribution */}
          <div className="detail-section">
            <span className="detail-section-title">Exercises This Week</span>
            {breakdown.length === 0 ? (
              <p className="detail-empty-line">No exercises logged for {muscle} this week.</p>
            ) : (
              <div className="detail-exercise-list">
                {breakdown.map(ex => (
                  <div key={ex.exerciseName} className="detail-exercise-row">
                    <div className="detail-exercise-row-top">
                      <span className="detail-exercise-name">{ex.exerciseName}</span>
                      <span className="detail-exercise-sets">{ex.sets} sets</span>
                    </div>
                    <div className="detail-contribution-track">
                      <div className="detail-contribution-fill" style={{ width: `${ex.contributionPercent}%` }} />
                    </div>
                    <span className="detail-contribution-label">{ex.contributionPercent}% of weekly volume · {ex.maxWeight}kg max</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Best Lift + Personal Records */}
          <div className="detail-section">
            <span className="detail-section-title">Best Lift (all-time)</span>
            {bestLift ? (
              <p className="detail-best-lift">{bestLift.exerciseName} — {bestLift.weight}kg × {bestLift.reps}</p>
            ) : (
              <p className="detail-empty-line">No lifts recorded yet.</p>
            )}

            {personalRecords.length > 0 && (
              <div className="detail-pr-list">
                {personalRecords.map(pr => (
                  <span key={pr.exerciseName} className="detail-pr-chip">{pr.exerciseName}: {pr.weight}kg × {pr.reps}</span>
                ))}
              </div>
            )}
          </div>

          {/* Estimated Growth Score */}
          <div className="detail-section">
            <span className="detail-section-title">Estimated Growth Score</span>
            <div className="detail-growth-score-row">
              <strong className="detail-growth-score-value">{growth.score}</strong>
              <span className="detail-growth-score-max">/100</span>
            </div>
            <p className="detail-growth-caption">
              Based on this week's volume adherence, training frequency, and week-over-week strength trend —
              not a measurement of actual muscle growth (this app doesn't track body composition).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MuscleDetailModal;
