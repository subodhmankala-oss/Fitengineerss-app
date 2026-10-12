import React from 'react';

// Small caption under a warm-up block exercise's name in the logger
// (client and coach Live Log), so it's clear these aren't the workout
// itself. Same amber as the "W" set label.
export default function WarmupCaption({ position }) {
  if (!position) return null;
  return (
    <div className="warmup-caption">
      🔥 Warm-up {position.n} of {position.total}
      {position.n === 1 && ' · go light, about 5 min'}
    </div>
  );
}
