import React from 'react';

// Amber strip on top of a warm-up block card in the logger (client and
// coach Live Log), so it's clear these aren't the workout itself. Same
// amber as the "W" set label. The first card also says how to do them.
export default function WarmupStrip({ position }) {
  if (!position) return null;
  return (
    <div className="warmup-strip">
      <span className="warmup-strip-label">🔥 Warm-up {position.n} of {position.total}</span>
      {position.n === 1 && <span className="warmup-strip-hint">Go light, about 5 min, then your workout starts</span>}
    </div>
  );
}
