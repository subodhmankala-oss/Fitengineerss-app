// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../services/databaseService', () => {
  const svc = {
    getDefaultWorkoutTemplates: vi.fn().mockResolvedValue([]),
    getGenericWorkoutsByLevel: vi.fn().mockResolvedValue([]),
    getWorkoutPlansForUser: vi.fn().mockResolvedValue([]),
    getOwnCoachConnection: vi.fn().mockResolvedValue({ connected: false, resolved: true }),
    resolveUserId: vi.fn().mockResolvedValue('u1'),
    getWorkoutLogsForUser: vi.fn().mockResolvedValue([]),
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
    saveWorkoutSession: vi.fn().mockResolvedValue(undefined),
    saveWorkoutPlan: vi.fn().mockResolvedValue(undefined),
    getWorkoutDraft: vi.fn().mockResolvedValue(null),
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    BUILTIN_TEMPLATES: []
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});
vi.mock('../utils/pushNotify', () => ({ notifyEvent: vi.fn() }));

import WorkoutTracker from './WorkoutTracker';
import { TourProvider } from '../context/TourContext';
import { startLibraryProgram } from '../utils/startLibraryProgram';

Element.prototype.scrollTo = vi.fn();

describe('Library program with a cardio move (Incline Walk 12-3-30)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('logs the walk as distance + time with the 30 min target, not as reps', async () => {
    startLibraryProgram('u1', 'gym', 'beginner', {
      name: 'Beginner Incline Walk 12-3-30',
      exercises: [
        { name: 'Incline Walk', sets: 1, reps: '30 min' },
        { name: 'Dead Bug', sets: 3, reps: '10' },
        { name: 'Plank', sets: 3, reps: '30s' },
      ],
    });
    render(<TourProvider><WorkoutTracker /></TourProvider>);

    const card = (await screen.findAllByText('Incline Walk'))
      .map(el => el.closest('.hevy-exercise-card'))
      .find(Boolean);
    expect(card).toBeTruthy();
    expect(card.querySelector('.hevy-set-row--cardio')).not.toBeNull();
    expect(Array.from(card.querySelectorAll('.hevy-table-header span')).map(el => el.textContent.trim()).slice(0, 4))
      .toEqual(['SET', 'PREV', 'KM', 'TIME']);
    expect(card.querySelector('.cardio-time-input .set-value-placeholder').textContent).toBe('30:00');
  });
});
