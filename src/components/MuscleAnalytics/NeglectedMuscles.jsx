import React, { useMemo } from 'react';
import { getLastTrainedInfo, RECOMMENDED_EXERCISES } from '../../utils/muscleAnalytics';
import MuscleThumbnail from './MuscleThumbnail';

// Same red used for the "Neglected" status elsewhere (MuscleCard, heat map
// legend) — every muscle here is by definition neglected, so the icon color
// doesn't need to vary card-to-card.
const NEGLECTED_COLOR = '#ef4444';

/**
 * Section 5 — Neglected Muscles. Membership is driven by `weeklyMuscleStats`
 * (zero sets logged in the current calendar week — the same numbers as the
 * per-muscle breakdown cards), not a rolling last-trained date. The two used
 * to disagree: a muscle trained a few days ago but before this week started
 * would show "not neglected" here while reading 0/target sets this week
 * everywhere else. `logs` is still used to show an honest "X days ago" /
 * "Never trained" badge on each card.
 *
 * Content-only (no card wrapper/header) — this shares a single card with
 * Section 1 (Muscle Balance Overview) via a left/right tab switcher in
 * WeeklyMuscleAnalytics.jsx, so the wrapper/header/subtext live there.
 */
const NeglectedMuscles = ({ logs, weeklyMuscleStats }) => {
  const neglected = useMemo(() => {
    return weeklyMuscleStats
      .filter(m => m.status.key === 'neglected')
      .map(m => {
        const info = getLastTrainedInfo(logs, m.muscle);
        return {
          muscle: m.muscle,
          daysSince: info ? info.daysSince : null,
          lastDate: info ? info.lastDate : null,
          recommendedExercises: RECOMMENDED_EXERCISES[m.muscle] || [],
        };
      })
      .sort((a, b) => {
        if (a.daysSince === null && b.daysSince === null) return 0;
        if (a.daysSince === null) return -1;
        if (b.daysSince === null) return 1;
        return b.daysSince - a.daysSince;
      });
  }, [logs, weeklyMuscleStats]);

  return (
    <>
      {neglected.length === 0 ? (
        <div className="neglected-empty-state">
          <span>✅</span>
          <p>Every muscle group has logged at least one set this week. Great consistency!</p>
        </div>
      ) : (
        <div className="neglected-list">
          {neglected.map(({ muscle, daysSince, recommendedExercises }) => (
            <div key={muscle} className="neglected-card">
              <div className="neglected-card-top">
                <span className="neglected-muscle-name">
                  <MuscleThumbnail muscle={muscle} color={NEGLECTED_COLOR} size={32} />
                  {muscle}
                </span>
                <span className="neglected-days-badge">
                  {daysSince == null ? 'Never trained' : `${daysSince} day${daysSince === 1 ? '' : 's'} ago`}
                </span>
              </div>
              <div className="neglected-recs">
                <span className="neglected-recs-label">Recommended exercises</span>
                <div className="neglected-recs-list">
                  {recommendedExercises.map(ex => (
                    <span key={ex} className="neglected-rec-chip">{ex}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default NeglectedMuscles;
