// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

vi.mock('../services/databaseService', () => {
  const svc = {
    getDefaultWorkoutTemplates: vi.fn().mockResolvedValue([]),
    getGenericWorkoutsByLevel: vi.fn().mockResolvedValue([]),
    getWorkoutPlansForUser: vi.fn().mockResolvedValue([]),
    getOwnCoachConnection: vi.fn().mockResolvedValue({ connected: false, resolved: true }),
    resolveUserId: vi.fn().mockResolvedValue('u1'),
    getWorkoutLogsForUser: vi.fn().mockResolvedValue([]),
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
    getWorkoutDraft: vi.fn().mockResolvedValue(null),
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    BUILTIN_TEMPLATES: []
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});

import WorkoutTracker from './WorkoutTracker';
import { TourProvider } from '../context/TourContext';

Element.prototype.scrollTo = vi.fn();

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
};

// Sessions every 3 days, the last one `lastDaysAgo` days ago.
const seedSessions = (lastDaysAgo) => {
  const sessions = Array.from({ length: 10 }, (_, i) => ({
    id: `s${i}`,
    date: daysAgo(lastDaysAgo + (9 - i) * 3),
    clientName: 'TestClient',
    exercises: [{ name: 'Bench Press', sets: [{ reps: 8, weight: String(40 + i) }] }]
  }));
  localStorage.setItem('workoutSessions', JSON.stringify(sessions));
};

const renderTracker = () => render(<TourProvider><WorkoutTracker /></TourProvider>);

describe('Training Level bar — idle drop is visible', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('two idle weeks: amber tag, lost stretch and −2 next to the score', async () => {
    seedSessions(15);
    const { container } = renderTracker();
    await waitFor(() => expect(screen.getByLabelText('Down 2 points')).toBeTruthy());
    expect(container.querySelector('.skill-level-score-drop').textContent).toBe('−2');
    expect(container.querySelector('.skill-level-marker.is-dropping')).toBeTruthy();
    expect(screen.getAllByTestId('skill-level-lost').length).toBeGreaterThan(0);
  });

  it('trained this week: none of the drop cues', async () => {
    seedSessions(1);
    const { container } = renderTracker();
    await waitFor(() => expect(container.querySelector('.skill-level-marker')).toBeTruthy());
    expect(screen.queryByLabelText(/^Down \d/)).toBeNull();
    expect(container.querySelector('.skill-level-score-drop')).toBeNull();
    expect(screen.queryAllByTestId('skill-level-lost')).toHaveLength(0);
    expect(container.querySelector('.skill-level-score').textContent).toMatch(/^\d+\/100$/);
  });
});
