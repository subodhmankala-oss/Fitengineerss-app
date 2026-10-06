// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

// jsdom has no IntersectionObserver (LazyMuscleIcon uses one) — stub it.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.IntersectionObserver = MockIntersectionObserver;

vi.mock('../services/databaseService', () => ({
  __esModule: true,
  default: {
    getExerciseLibrary: vi.fn().mockResolvedValue([
      { id: 1, name: 'Flat Bench Press', category: 'Chest', primary_muscle: 'Chest' },
      { id: 2, name: 'Barbell Curl', category: 'Arms', primary_muscle: 'Biceps' },
      { id: 3, name: 'Squat', category: 'Legs', primary_muscle: 'Quads' },
      { id: 4, name: 'Lat Pull Down', category: 'Back', primary_muscle: 'Back' },
    ]),
    getCustomExercisesForViewer: vi.fn().mockResolvedValue([]),
  },
}));

import ExercisePickerModal from './ExercisePickerModal';

afterEach(cleanup);

const open = () => render(<ExercisePickerModal open onClose={() => {}} onAdd={() => {}} onRemove={() => {}} />);
// The body panel's own buttons — its muscle chips share names with the
// category chips (Chest, Back, Core…), so queries are scoped to the panel.
const panel = () => within(document.querySelector('.exercise-body-picker'));
const openBody = () => fireEvent.click(screen.getByRole('button', { name: '🧍 Body' }));

describe('ExercisePickerModal body picker', () => {
  it('lists only exercises that mainly train the tapped muscle', async () => {
    open();
    await screen.findByText('Barbell Curl');

    openBody();
    fireEvent.click(panel().getByRole('button', { name: 'Chest' }));

    await waitFor(() => expect(screen.queryByText('Barbell Curl')).toBeNull());
    expect(screen.getByText('Flat Bench Press')).toBeTruthy();
    expect(screen.queryByText('Squat')).toBeNull();
    // The diagram closes and the chip shows the active muscle.
    expect(screen.getByRole('button', { name: /🧍 Chest/ })).toBeTruthy();
  });

  it('switches to the back view, and clears via ✕ or a category chip', async () => {
    open();
    await screen.findByText('Barbell Curl');

    openBody();
    fireEvent.click(panel().getByRole('button', { name: 'Back' })); // view toggle
    // Now "Back" is both the toggle and a muscle chip; the chip comes last.
    fireEvent.click(panel().getAllByRole('button', { name: 'Back' }).at(-1));
    await waitFor(() => expect(screen.queryByText('Flat Bench Press')).toBeNull());
    expect(screen.getByText('Lat Pull Down')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear Back filter' }));
    await screen.findByText('Flat Bench Press');

    openBody();
    fireEvent.click(panel().getByRole('button', { name: 'Front' }));
    fireEvent.click(panel().getByRole('button', { name: 'Biceps' }));
    await waitFor(() => expect(screen.queryByText('Squat')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Legs' }));
    expect(screen.getByText('Squat')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /🧍 Biceps/ })).toBeNull();
  });
});
