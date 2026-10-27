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

// A workout left unsaved on 15 Jul: started 09:00, two ticked sets (the last
// at 09:50), one never done, and the app closed while paused.
const start = new Date(2026, 6, 15, 9, 0).getTime();
const at = (m) => start + m * 60000;
const earlierDraft = {
  isLoggingWorkout: true,
  logExercises: [
    { name: 'Bench Press', sets: [
      { reps: 10, weight: '40', isCompleted: true, completedAt: at(10) },
      { reps: 10, weight: '40', isCompleted: false }
    ] },
    { name: 'Lat Pull Down', sets: [{ reps: 12, weight: '35', isCompleted: true, completedAt: at(50) }] }
  ],
  logClient: 'TestClient',
  logDate: '2026-07-15',
  templateName: 'Upper Day',
  activeTemplateName: 'Upper Day',
  saveAsTemplate: false,
  workoutTimerStatus: 'paused',
  workoutTimerStartedAt: start,
  workoutPauseIntervals: [{ pausedAt: at(55), resumedAt: null }],
  savedAt: at(55)
};

describe('WorkoutTracker unfinished workout from an earlier day', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    localStorage.setItem('workoutDraft_u1', JSON.stringify(earlierDraft));
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('asks before anything else, naming the day it was done', async () => {
    renderWorkoutTracker();
    expect(await screen.findByText('From Wed, 15 Jul')).toBeTruthy();
    expect(screen.getByText('Save to 15 Jul')).toBeTruthy();
    expect(screen.getByText('Continue it as today')).toBeTruthy();
  });

  it('saves the ticked sets to that day, with that day\'s duration', async () => {
    renderWorkoutTracker();
    fireEvent.click(await screen.findByText('Save to 15 Jul'));
    fireEvent.click(await screen.findByText('Confirm Save'));

    await waitFor(() => expect(databaseService.saveWorkoutSession).toHaveBeenCalled());
    const session = databaseService.saveWorkoutSession.mock.calls[0][0];
    expect(session.date).toBe('2026-07-15');
    // 09:00 to the last ticked set at 09:50 — not the weeks since.
    expect(session.durationSeconds).toBe(50 * 60);
    expect(session.exercises.map(ex => [ex.name, ex.sets.length])).toEqual([['Bench Press', 1], ['Lat Pull Down', 1]]);
    await waitFor(() => expect(databaseService.deleteWorkoutDraft).toHaveBeenCalledWith('u1', 'self'));
  });

  it('continues as today without saving when asked to', async () => {
    renderWorkoutTracker();
    fireEvent.click(await screen.findByText('Continue it as today'));
    expect(screen.queryByText('From Wed, 15 Jul')).toBeNull();
    expect(databaseService.saveWorkoutSession).not.toHaveBeenCalled();
  });
});
