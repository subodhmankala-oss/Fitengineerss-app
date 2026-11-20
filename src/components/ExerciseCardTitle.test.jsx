import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ExerciseCardTitle from './ExerciseCardTitle';

afterEach(cleanup);

describe('ExerciseCardTitle Busy?', () => {
  it('shows no Note line, even when a note is passed', () => {
    render(<ExerciseCardTitle name="Lat Pull Down" note="Coach says hi" onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.queryByText('Note')).toBeNull();
    expect(screen.queryByText('Coach says hi')).toBeNull();
    expect(screen.queryByText(/collarbone/)).toBeNull();
  });
  it('Busy? shows one stand-in with Swap, and Undo beside it after a Busy? swap', () => {
    let swapped = false; let undone = false;
    render(<ExerciseCardTitle
      name="Dumbbell Row"
      busy={{ option: { name: 'Inverted Row', match: 78, onSwap: () => { swapped = true; } }, onUndo: () => { undone = true; } }}
      onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.getByText('Dumbbells taken?')).toBeTruthy();
    expect(screen.getByText('Inverted Row')).toBeTruthy();
    expect(screen.getByText('78%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Swap to Inverted Row' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(swapped).toBe(true);
    expect(undone).toBe(true);
  });
  it('after the 3rd Busy? swap only Undo is left', () => {
    render(<ExerciseCardTitle name="Pull-up" busy={{ option: null, onUndo: () => {} }} onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.queryByText('Mat taken?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Swap to/ })).toBeNull();
  });
});

describe('ExerciseCardTitle muscle label', () => {
  it('names the body part in everyday words: Back, not Lats', () => {
    render(<ExerciseCardTitle name="Lat Pull Down" record={{ primary_muscle: 'Latissimus Dorsi' }} onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.getByText('Back')).toBeTruthy();
    expect(screen.queryByText(/Lat(s|issimus)/)).toBeNull();
  });
  it('Cable busy? on a cable exercise', () => {
    render(<ExerciseCardTitle name="Cable Row" busy={{ option: { name: 'Dumbbell Row', match: 82, onSwap: () => {} } }} onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.getByText('Cable busy?')).toBeTruthy();
  });
  it('shows only the one main muscle, short, beside the name', () => {
    render(<ExerciseCardTitle
      name="Incline Dumbbell Press"
      record={{ primary_muscle: 'Upper Chest (Pectoralis Major)', secondary_muscle: 'Anterior Deltoids, Triceps' }}
      onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.getByText('Chest')).toBeTruthy();
    expect(screen.queryByText(/Pectoralis/)).toBeNull();
    expect(screen.queryByText('Triceps')).toBeNull();
    expect(screen.queryByText('Anterior Deltoids')).toBeNull();
  });
});
