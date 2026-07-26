import React from 'react';

// Purely presentational — `recommendations` is the already-generated,
// data-gated string list from getRecommendations().
//
// Content-only (no card wrapper/header) — this shares a single card with
// Weekly Insights and Progress Comparison via a 3-way tab switcher in
// WeeklyMuscleAnalytics.jsx, so the wrapper/header live there.
const Recommendations = ({ recommendations }) => {
  if (recommendations.length === 0) {
    return (
      <div className="neglected-empty-state">
        <span>✅</span>
        <p>No action items right now — your training looks well balanced.</p>
      </div>
    );
  }

  return (
    <div className="recommendation-list">
      {recommendations.map((text, i) => (
        <div key={i} className="recommendation-item" style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}>
          <span className="recommendation-bullet">•</span>
          <span>{text}</span>
        </div>
      ))}
    </div>
  );
};

export default Recommendations;
