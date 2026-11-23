import React from 'react';
import './OpeningLogger.css';

// Stands in for the logger while a workout that was just started is still
// loading, so the client never sees another tab first.
export default function OpeningLogger() {
  return (
    <div className="opening-logger" role="status" aria-label="Opening your workout" data-testid="opening-logger">
      <div className="opening-logger-bar" />
      <div className="opening-logger-card" />
      <div className="opening-logger-card" />
    </div>
  );
}
