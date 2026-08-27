// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// jsdom has no IntersectionObserver; ExercisePickerModal's LazyMuscleIcon
// uses one to defer the (expensive) muscle SVG mount until a row scrolls
// into view. Not what this file tests — stub it so the modal can mount.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.IntersectionObserver = MockIntersectionObserver;

// Exercises deliberately chosen so a mid-word fragment ("press") only
// prefix-matches one of them, to prove substring matching actually works
// (the bug being fixed: search used to be prefix-only).
vi.mock('../services/databaseService', () => ({
  __esModule: true,
  default: {
    getExerciseLibrary: vi.fn().mockResolvedValue([
      { name: 'Bench Press', category: 'Chest', primary_muscle: 'Chest' },
      { name: 'Overhead Press', category: 'Shoulders', primary_muscle: 'Shoulders' },
      { name: 'Barbell Curl', category: 'Arms', primary_muscle: 'Biceps' },
      { name: 'Squat', category: 'Legs', primary_muscle: 'Quads' }
    ])
  }
}));

import ExercisePickerModal from './ExercisePickerModal';

afterEach(cleanup);

describe('ExercisePickerModal search', () => {
  it('matches a mid-word fragment, not just a name prefix', async () => {
    render(<ExercisePickerModal open onClose={() => {}} onAdd={() => {}} onRemove={() => {}} />);

    const input = await screen.findByPlaceholderText(/search by name/i);
    fireEvent.change(input, { target: { value: 'press' } });

    await waitFor(() => {
      expect(screen.getByText('Bench Press')).toBeTruthy();
      expect(screen.getByText('Overhead Press')).toBeTruthy();
    });
    expect(screen.queryByText('Barbell Curl')).toBeNull();
    expect(screen.queryByText('Squat')).toBeNull();
  });

  it('ranks a name prefix match above a mid-string match', async () => {
    render(<ExercisePickerModal open onClose={() => {}} onAdd={() => {}} onRemove={() => {}} />);

    const input = await screen.findByPlaceholderText(/search by name/i);
    fireEvent.change(input, { target: { value: 'over' } });

    await waitFor(() => expect(screen.getByText('Overhead Press')).toBeTruthy());
    const names = screen.getAllByText(/Press|Curl|Squat/).map(el => el.textContent);
    expect(names[0]).toBe('Overhead Press');
  });

  it('also matches by category/primary_muscle', async () => {
    render(<ExercisePickerModal open onClose={() => {}} onAdd={() => {}} onRemove={() => {}} />);

    const input = await screen.findByPlaceholderText(/search by name/i);
    fireEvent.change(input, { target: { value: 'biceps' } });

    await waitFor(() => expect(screen.getByText('Barbell Curl')).toBeTruthy());
    expect(screen.queryByText('Bench Press')).toBeNull();
  });

  it('shows a clear button once text is typed, and clearing empties the input', async () => {
    render(<ExercisePickerModal open onClose={() => {}} onAdd={() => {}} onRemove={() => {}} />);

    const input = await screen.findByPlaceholderText(/search by name/i);
    expect(screen.queryByLabelText('Clear search')).toBeNull();

    fireEvent.change(input, { target: { value: 'press' } });
    const clearBtn = await screen.findByLabelText('Clear search');

    fireEvent.click(clearBtn);
    expect(input.value).toBe('');
    expect(screen.queryByLabelText('Clear search')).toBeNull();
  });
});
