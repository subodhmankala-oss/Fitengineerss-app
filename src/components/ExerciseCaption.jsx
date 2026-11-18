import React from 'react';
import { SwapIcon } from './LiveSwapSheet';

// Small caption under an exercise's name in the logger (client and coach
// Live Log) for a Workout Library session:
//   - warm-up block: "🔥 Warm-up 1 of 3 · go light, about 5 min" — same
//     amber as the "W" set label, so it's clear it isn't the workout itself
//   - a swap: "🔄 New · instead of Dumbbell Row"
//   - neglected-muscle finisher: "🎯 Finisher · Calves not trained in 12 days"
//   - a live swap from the ≡ menu (swapBy set): line icon, "New · instead
//     of Bench Press" ("Coach swapped · …" when the coach did it) and Undo
//     until a set of the new exercise is ticked (onUndo)
export default function ExerciseCaption({ warmupPosition, swappedFrom, finisherFor, swapBy, onUndo }) {
  if (warmupPosition) {
    return (
      <div className="warmup-caption">
        🔥 Warm-up {warmupPosition.n} of {warmupPosition.total}
        {warmupPosition.n === 1 && ' · go light, about 5 min'}
      </div>
    );
  }
  if (swappedFrom && swapBy) {
    return (
      <div className="swap-caption swap-caption--live">
        <SwapIcon size={13} />
        <span>{swapBy === 'coach' ? 'Coach swapped' : 'New'} · instead of {swappedFrom}</span>
        {onUndo && <button type="button" className="swap-undo" onClick={onUndo}>Undo</button>}
      </div>
    );
  }
  if (swappedFrom) {
    return <div className="swap-caption">🔄 New · instead of {swappedFrom}</div>;
  }
  if (finisherFor) {
    const when = finisherFor.daysSince == null ? 'not trained yet' : `not trained in ${finisherFor.daysSince} days`;
    return <div className="swap-caption">🎯 Finisher · {finisherFor.muscle} {when}</div>;
  }
  return null;
}
