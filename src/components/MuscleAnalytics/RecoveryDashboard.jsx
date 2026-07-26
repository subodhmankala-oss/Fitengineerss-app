import React, { useMemo } from 'react';
import { MUSCLE_GROUPS } from '../../utils/muscleGroups';
import { getMuscleRecovery, formatEstimatedReady } from '../../utils/muscleAnalytics';

const formatHoursAgo = (hours) => {
  if (hours < 1) return 'less than an hour ago';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const RecoveryRow = ({ muscle, logs, now }) => {
  const recovery = useMemo(() => getMuscleRecovery(logs, muscle, now), [logs, muscle, now]);

  if (!recovery) {
    return (
      <div className="recovery-row">
        <div className="recovery-row-top">
          <span className="recovery-muscle-name">{muscle}</span>
          <span className="recovery-badge status-not-trained">Not Yet Trained</span>
        </div>
        <p className="recovery-meta">No training history for this muscle yet.</p>
      </div>
    );
  }

  const { hoursSince, percent, bucket, estimatedReadyAt } = recovery;

  return (
    <div className="recovery-row">
      <div className="recovery-row-top">
        <span className="recovery-muscle-name">{muscle}</span>
        <span className={`recovery-badge status-${bucket.color}`}>{bucket.label}</span>
      </div>
      <p className="recovery-meta">Last trained {formatHoursAgo(hoursSince)}</p>

      <div className="recovery-progress-row">
        <div className="recovery-progress-track">
          <div className={`recovery-progress-fill status-${bucket.color}`} style={{ width: `${percent}%` }} />
        </div>
        <span className={`recovery-percent status-${bucket.color}`}>{percent}%</span>
      </div>

      {percent < 100 && (
        <p className="recovery-ready-line">Estimated ready: {formatEstimatedReady(estimatedReadyAt, now)}</p>
      )}
    </div>
  );
};

/**
 * Section 4 — Recovery Dashboard. Every muscle gets a row; recovery is
 * estimated from time-since-last-set (via created_at, see muscleAnalytics.js
 * header comment) scaled by that session's volume. RPE isn't tracked yet
 * (spec calls this out as future support).
 *
 * Content-only (no card wrapper/header) — this shares a single card with
 * the Muscle Heat Map via a tab switcher in WeeklyMuscleAnalytics.jsx, so
 * the wrapper/header live there.
 */
const RecoveryDashboard = ({ logs }) => {
  const now = useMemo(() => new Date(), []);

  return (
    <>
      <p className="muscle-analytics-subtext">Estimated recovery since each muscle's last working set.</p>
      <div className="recovery-list">
        {MUSCLE_GROUPS.map(muscle => (
          <RecoveryRow key={muscle} muscle={muscle} logs={logs} now={now} />
        ))}
      </div>
    </>
  );
};

export default RecoveryDashboard;
