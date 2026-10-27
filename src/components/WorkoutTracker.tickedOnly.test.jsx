// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

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
    deleteWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    checkAndHandleSessionPackageCompletion: vi.fn().mockResolvedValue({}),
    BUILTIN_TEMPLATES: []
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});
vi.mock('../utils/pushNotify', () => ({ notifyEvent: vi.fn() }));
vi.mock('../pwa/registerPWA', () => ({
  checkForPendingPWAUpdate: vi.fn().mockResolvedValue(false),
  applyPWAUpdate: vi.fn()
}));

import WorkoutTracker from './WorkoutTracker';
import databaseService from '../services/databaseService';
import { TourProvider } from '../context/TourContext';

Element.prototype.scrollTo = vi.fn();

const renderWorkoutTracker = () => render(<TourProvider><WorkoutTracker /></TourProvider>);

import { getLocalDateString } from '../utils/dateUtils';

// Today's workout with one set skipped: Save used to offer only Keep
// Logging or Discard, so it could not be saved at all.
const now = Date.now();
const todayDraft = {
  isLoggingWorkout: true,
  logExercises: [
    { name: 'Bench Press', sets: [
      { reps: 10, weight: '40', isCompleted: true, completedAt: now - 20 * 60000 },
      { reps: 10, weight: '40', isCompleted: false }
    ] },
    { name: 'Lat Pull Down', sets: [{ reps: 12, weight: '35', isCompleted: true, completedAt: now - 5 * 60000 }] }
  ],
  logClient: 'TestClient',
  logDate: getLocalDateString(),
  templateName: 'Upper Day',
  activeTemplateName: 'Upper Day',
  saveAsTemplate: false,
  workoutTimerStatus: 'running',
  workoutTimerStartedAt: now - 30 * 60000,
  workoutPauseIntervals: [],
  savedAt: now
};

describe('WorkoutTracker Save with some sets unticked', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    localStorage.setItem('workoutDraft_u1', JSON.stringify(todayDraft));
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('offers to save just the ticked sets, and saves only those', async () => {
    renderWorkoutTracker();
    fireEvent.click(await screen.findByText('💾 Save Workout Session'));
    expect(await screen.findByText('You ticked 2 of 3 sets.')).toBeTruthy();
    fireEvent.click(screen.getByText('Save 2 ticked sets'));
    fireEvent.click(await screen.findByText('Confirm Save'));

    await waitFor(() => expect(databaseService.saveWorkoutSession).toHaveBeenCalled());
    const session = databaseService.saveWorkoutSession.mock.calls[0][0];
    expect(session.date).toBe(getLocalDateString());
    expect(session.exercises.map(ex => [ex.name, ex.sets.length])).toEqual([['Bench Press', 1], ['Lat Pull Down', 1]]);
  });
});
