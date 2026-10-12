import React from 'react';

// Small caption under an exercise's name in the logger (client and coach
// Live Log) for a Workout Library session:
//   - warm-up block: "🔥 Warm-up 1 of 3 · go light, about 5 min" — same
//     amber as the "W" set label, so it's clear it isn't the workout itself
//   - this week's swap: "🔄 New this week · instead of Dumbbell Row"
//   - neglected-muscle finisher: "🎯 Finisher · Calves not trained in 12 days"
export default function ExerciseCaption({ warmupPosition, swappedFrom, finisherFor }) {
  if (warmupPosition) {
    return (
      <div className="warmup-caption">
        🔥 Warm-up {warmupPosition.n} of {warmupPosition.total}
        {warmupPosition.n === 1 && ' · go light, about 5 min'}
      </div>
    );
  }
  if (swappedFrom) {
    return <div className="swap-caption">🔄 New this week · instead of {swappedFrom}</div>;
  }
  if (finisherFor) {
    const when = finisherFor.daysSince == null ? 'not trained yet' : `not trained in ${finisherFor.daysSince} days`;
    return <div className="swap-caption">🎯 Finisher · {finisherFor.muscle} {when}</div>;
  }
  return null;
}
