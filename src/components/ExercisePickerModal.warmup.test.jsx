// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// See ExercisePickerModal.search.test.jsx — the muscle icons need one.
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
      { name: 'Leg Swing', category: 'Warm Up', primary_muscle: 'Hip Flexors' },
      { name: 'Squat', category: 'Legs', primary_muscle: 'Quads' },
      { name: 'Jumping Jack', category: 'Other', primary_muscle: 'Full Body' },
      { name: 'Barbell Curl', category: 'Arms', primary_muscle: 'Biceps' }
    ]),
    getCustomExercisesForViewer: vi.fn().mockResolvedValue([])
  }
}));

import ExercisePickerModal from './ExercisePickerModal';

afterEach(cleanup);

const chip = (label) => Array.from(document.querySelectorAll('.filter-tag-btn')).find(b => b.textContent.replace('▾', '').trim() === label);

describe('ExercisePickerModal "Warm Up" chip', () => {
  it('lists the warm-up block moves too, and they stay under their own category', async () => {
    render(<ExercisePickerModal open onClose={() => {}} onAdd={() => {}} onRemove={() => {}} />);
    await screen.findByPlaceholderText(/search by name/i);

    fireEvent.click(chip('Warm Up'));
    await waitFor(() => {
      expect(screen.getByText('Leg Swing')).toBeTruthy();
      expect(screen.getByText('Squat')).toBeTruthy();
      expect(screen.getByText('Jumping Jack')).toBeTruthy();
      expect(screen.queryByText('Barbell Curl')).toBeNull();
    });

    fireEvent.click(chip('Legs'));
    await waitFor(() => {
      expect(screen.getByText('Squat')).toBeTruthy();
      expect(screen.queryByText('Leg Swing')).toBeNull();
    });
  });
});
