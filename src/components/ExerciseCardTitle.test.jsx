import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ExerciseCardTitle from './ExerciseCardTitle';

afterEach(cleanup);

describe('ExerciseCardTitle note line', () => {
  it('shows the coach note under the name with a Note label', () => {
    render(<ExerciseCardTitle name="Lat Pulldown" note="Pull to your collarbone" onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.getByText('Note')).toBeTruthy();
    expect(screen.getByText('Pull to your collarbone')).toBeTruthy();
  });

  it('shows no Note line when there is no note', () => {
    render(<ExerciseCardTitle name="My Made Up Move" onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.queryByText('Note')).toBeNull();
  });
});

describe('ExerciseCardTitle written note + Busy?', () => {
  it('shows the written library note when there is no coach note', () => {
    render(<ExerciseCardTitle name="Lat Pull Down" onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.getByText(/collarbone/)).toBeTruthy();
  });
  it("a coach's note replaces the written one", () => {
    render(<ExerciseCardTitle name="Lat Pull Down" note="Coach says hi" onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.getByText('Coach says hi')).toBeTruthy();
    expect(screen.queryByText(/collarbone/)).toBeNull();
  });
  it('Busy? shows each option and tapping one swaps to it', () => {
    let swapped = null;
    const opts = ['Dumbbell Row', 'Inverted Row', 'Pull-up'].map((name, i) => ({ name, match: 80 - i, onSwap: () => { swapped = name; } }));
    render(<ExerciseCardTitle name="Lat Pull Down" busy={opts} onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.getByText('Busy?')).toBeTruthy();
    expect(screen.getByText('Swap to')).toBeTruthy();
    screen.getByRole('button', { name: /Swap to Inverted Row/ }).click();
    expect(swapped).toBe('Inverted Row');
    expect(screen.getAllByRole('button', { name: /^Swap to/ }).length).toBe(3);
  });
});

describe('ExerciseCardTitle muscle label', () => {
  it('shows only the one main muscle, short, beside the name', () => {
    render(<ExerciseCardTitle
      name="Incline Dumbbell Press"
      record={{ primary_muscle: 'Upper Chest (Pectoralis Major)', secondary_muscle: 'Anterior Deltoids, Triceps' }}
      onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.getByText('Upper Chest')).toBeTruthy();
    expect(screen.queryByText(/Pectoralis/)).toBeNull();
    expect(screen.queryByText('Triceps')).toBeNull();
    expect(screen.queryByText('Anterior Deltoids')).toBeNull();
  });
});
