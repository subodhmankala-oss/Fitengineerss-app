import React from 'react';
import { InsightRow, InsightsEmpty } from './WeeklyInsights';

// Purely presentational — `recommendations` is the already-generated,
// data-gated string list from getRecommendations(). Same rows as Insights,
// with a "do this" arrow badge.
//
// Content-only (no card wrapper/header) — this shares a single card with
// Weekly Insights and Progress Comparison via a 3-way switcher in
// WeeklyMuscleAnalytics.jsx, so the wrapper/header live there.
const Recommendations = ({ recommendations }) => {
  if (recommendations.length === 0) {
    return <InsightsEmpty>No action items right now. Your training looks well balanced.</InsightsEmpty>;
  }

  return (
    <div className="insight-list">
      {recommendations.map((text, i) => <InsightRow key={i} text={text} tone="tip" index={i} />)}
    </div>
  );
};

export default Recommendations;
