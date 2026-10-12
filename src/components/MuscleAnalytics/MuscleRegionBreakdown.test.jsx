// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MuscleRegionBreakdown from './MuscleRegionBreakdown';
import { queueWorkoutAdd, unqueueWorkoutAdd, getPendingWorkoutAdds } from '../../utils/pendingWorkoutAdds';

const regions = [
  { id: 'Lats', sets: 0, band: { min: 4, max: 8 }, hint: '', exercises: [], suggestions: ['Lat Pulldown', 'Pull Up'], tier: null },
  { id: 'Mid Back', sets: 0, band: { min: 4, max: 8 }, hint: '', exercises: [], suggestions: ['Seated Cable Row'], tier: null },
];

// Same wiring as WorkoutProgressDashboard: the queue is the source of truth.
function Harness() {
  const [queued, setQueued] = useState(() => getPendingWorkoutAdds());
  return (
    <MuscleRegionBreakdown
      muscle="Back"
      regions={regions}
      focusRegion="Lats"
      onAddExercise={n => { queueWorkoutAdd(n); setQueued(getPendingWorkoutAdds()); }}
      onRemoveExercise={n => { unqueueWorkoutAdd(n); setQueued(getPendingWorkoutAdds()); }}
      addedNames={queued}
      addedCount={queued.length}
      onGoToWorkout={() => {}}
    />
  );
}

describe('Muscle part "Try these" chips', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('tick several, and tap a ticked one again to untick it', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Lat Pulldown/ }));
    fireEvent.click(screen.getByRole('button', { name: /Pull Up/ }));
    expect(getPendingWorkoutAdds()).toEqual(['Lat Pulldown', 'Pull Up']);
    expect(screen.getByText('Add 2 exercises to my workout →')).toBeTruthy();

    const ticked = screen.getByRole('button', { name: /Lat Pulldown/ });
    expect(ticked.getAttribute('aria-pressed')).toBe('true');
    expect(ticked.disabled).toBe(false);
    fireEvent.click(ticked);
    expect(getPendingWorkoutAdds()).toEqual(['Pull Up']);
    expect(screen.getByRole('button', { name: /Lat Pulldown/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Add 1 exercise to my workout →')).toBeTruthy();
  });

  it('remembers ticks made on another muscle', () => {
    queueWorkoutAdd('Pull Up');
    queueWorkoutAdd('Incline Bench Press');
    render(<Harness />);
    expect(screen.getByRole('button', { name: /Pull Up/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Add 2 exercises to my workout →')).toBeTruthy();
  });
});
