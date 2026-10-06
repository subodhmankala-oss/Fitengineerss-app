// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import LibraryProgramPreview from './LibraryProgramPreview';

afterEach(cleanup);

const workout = {
  id: 'p1',
  name: 'Push Day',
  exercises: [
    { name: 'Dumbbell Bench Press', sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }] },
    { name: 'Cable Pushdown', sets: [{ reps: 12 }, { reps: 10 }] },
  ],
};

describe('LibraryProgramPreview', () => {
  it('shows tags and every exercise with its sets', () => {
    render(<LibraryProgramPreview workout={workout} level="beginner" onStart={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Push Day' })).toBeTruthy();
    expect(screen.getByText('🌱 Beginner')).toBeTruthy();
    expect(screen.getByText('Dumbbells')).toBeTruthy();
    expect(screen.getByText('Machines')).toBeTruthy();
    expect(screen.getByText('Dumbbell Bench Press')).toBeTruthy();
    expect(screen.getByText('3 sets × 10')).toBeTruthy();
    expect(screen.getByText('2 sets · 12/10')).toBeTruthy();
  });

  it('starts only from the Start button, and closes via ✕, backdrop or Escape', () => {
    const onStart = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<LibraryProgramPreview workout={workout} level="advanced" onStart={onStart} onClose={onClose} />);

    fireEvent.click(screen.getByText('Dumbbell Bench Press'));
    expect(onClose).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }));
    expect(onStart).toHaveBeenCalledWith(workout, 'advanced');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(container.querySelector('.wt-preview-backdrop'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
