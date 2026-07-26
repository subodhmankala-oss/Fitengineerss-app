import React, { useMemo } from 'react';
import { getNeglectedMuscles } from '../../utils/muscleAnalytics';
import MuscleThumbnail from './MuscleThumbnail';

// Same red used for the "Neglected" status elsewhere (MuscleCard, heat map
// legend) — every muscle here is by definition neglected, so the icon color
// doesn't need to vary card-to-card.
const NEGLECTED_COLOR = '#ef4444';

/**
 * Section 5 — Neglected Muscles. Uses actual last-trained date across ALL
 * history (not the weekly window) — see getNeglectedMuscles() for why that
 * distinction matters. Threshold: 7+ days idle, or never trained.
 *
 * Content-only (no card wrapper/header) — this shares a single card with
 * Section 1 (Muscle Balance Overview) via a left/right tab switcher in
 * WeeklyMuscleAnalytics.jsx, so the wrapper/header/subtext live there.
 */
const NeglectedMuscles = ({ logs }) => {
  const neglected = useMemo(() => getNeglectedMuscles(logs), [logs]);

  return (
    <>
      {neglected.length === 0 ? (
        <div className="neglected-empty-state">
          <span>✅</span>
          <p>Every muscle group has been trained within the last week. Great consistency!</p>
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
