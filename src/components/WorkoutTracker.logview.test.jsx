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
    saveWorkoutSession: vi.fn().mockResolvedValue(undefined),
    saveWorkoutPlan: vi.fn().mockResolvedValue(undefined),
    // WorkoutTracker's debounced draft-autosave effect fires ~1.2s after
    // mount whenever a logging session is active (every test here seeds one
    // via seedActiveDraft) — without these, a test that awaits past that
    // window (findByText's default timeout) hits the real setTimeout,
    // calling these as undefined and crashing with "is not a function".
    getWorkoutDraft: vi.fn().mockResolvedValue(null),
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    BUILTIN_TEMPLATES: []
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});

import WorkoutTracker from './WorkoutTracker';
import databaseService from '../services/databaseService';
import { TourProvider } from '../context/TourContext';

// WorkoutTracker calls useTour() (spotlight walkthrough state), which throws
// outside a TourProvider — render through this helper instead of the bare
// component everywhere below.
const renderWorkoutTracker = () => render(<TourProvider><WorkoutTracker /></TourProvider>);

// jsdom has no Element.scrollTo; the analytics chart calls it on mount to
// keep the selected session in view. Not what this file tests — stub it so
// the effect doesn't throw and take the render down with it.
Element.prototype.scrollTo = vi.fn();

const DRAFT_KEY = 'workoutDraft_u1';

// Seed an active logging session so the log view renders on mount.
const seedActiveDraft = () => localStorage.setItem(DRAFT_KEY, JSON.stringify({
  isLoggingWorkout: true,
  logExercises: [{ name: 'Bench Press', sets: [{ reps: 8, weight: '40', isCompleted: false }] }],
  logClient: 'TestClient',
  logDate: '2026-07-15',
  templateName: 'My Session',
  activeTemplateName: 'My Session',
  saveAsTemplate: false,
  workoutTimerStatus: 'idle',
  workoutTimerStartedAt: null,
  workoutPauseIntervals: [],
  savedAt: Date.now()
}));

// N logged sessions across N distinct dates → completedSessionsCount === N.
const logsForDates = (n) => Array.from({ length: n }, (_, i) => ({
  log_date: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`,
  exercise_name: 'Bench Press', reps: 8, weight_kg: 40
}));

describe('WorkoutTracker log view — header + billing visibility', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    databaseService.getOwnCoachConnection.mockResolvedValue({ connected: false, resolved: true });
    databaseService.getWorkoutLogsForUser.mockResolvedValue([]);
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows the client-friendly header, not the old coach-notebook copy', async () => {
    seedActiveDraft();
    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    expect(screen.queryByText('📝 Log New Workout Session')).toBeNull();
    expect(screen.queryByText(/directly from client notebooks/i)).toBeNull();
  });

  // The session-renewal box was removed from both the logger (#207) and the
  // analytics view (#209) — guard against it creeping back, using the case
  // that used to trigger it: a connected client with only 2 sessions left.
  it.each([
    ['logger', true],
    ['analytics view', false]
  ])('never shows a renewal box in the %s, even when nearly out of sessions', async (_view, logging) => {
    localStorage.setItem('userCoachId', 'coach-1');
    databaseService.getOwnCoachConnection.mockResolvedValue({ connected: true, resolved: true, totalSessions: 20 });
    databaseService.getWorkoutLogsForUser.mockResolvedValue(logsForDates(18)); // 2 left
    if (logging) seedActiveDraft();

    renderWorkoutTracker();
    // Give the async coach-connection + logs effects time to settle.
    await waitFor(() => expect(databaseService.getWorkoutLogsForUser).toHaveBeenCalled());
    await waitFor(() => expect(databaseService.getOwnCoachConnection).toHaveBeenCalled());
    expect(screen.queryByText(/Renew Package/i)).toBeNull();
    expect(screen.queryByText(/session[s]? left/i)).toBeNull();
  });
});
