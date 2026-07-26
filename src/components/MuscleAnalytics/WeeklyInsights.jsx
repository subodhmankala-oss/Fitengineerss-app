import React from 'react';

// Purely presentational — `insights` is the already-generated, data-gated
// string list from generateWeeklyInsights(). Nothing here invents content.
//
// Content-only (no card wrapper/header) — this shares a single card with
// Progress Comparison and Personal Recommendations via a 3-way tab switcher
// in WeeklyMuscleAnalytics.jsx, so the wrapper/header live there.
const WeeklyInsights = ({ insights }) => {
  if (insights.length === 0) {
    return (
      <div className="neglected-empty-state">
        <span>✅</span>
        <p>Nothing to flag this week — keep it up.</p>
      </div>
    );
  }

  return (
    <div className="insight-list">
      {insights.map((text, i) => (
        <div key={i} className="insight-item" style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}>
          <span>{text}</span>
        </div>
      ))}
    </div>
  );
};

export default WeeklyInsights;
