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

  it('hides the billing/renewal box while the client still has plenty of sessions left', async () => {
    localStorage.setItem('userCoachId', 'coach-1');
    databaseService.getOwnCoachConnection.mockResolvedValue({ connected: true, resolved: true, totalSessions: 20 });
    databaseService.getWorkoutLogsForUser.mockResolvedValue(logsForDates(4)); // 16 left
    seedActiveDraft();

    renderWorkoutTracker();
    await screen.findByText("🏋️ Today's Workout");
    // Give the async coach-connection + logs effects time to settle.
    await waitFor(() => expect(databaseService.getWorkoutLogsForUser).toHaveBeenCalled());
    expect(screen.queryByText(/Renew Package/i)).toBeNull();
    expect(screen.queryByText(/session[s]? left/i)).toBeNull();
  });

  it('shows the renewal box only when the connected client is nearly out of sessions', async () => {
    localStorage.setItem('userCoachId', 'coach-1');
    databaseService.getOwnCoachConnection.mockResolvedValue({ connected: true, resolved: true, totalSessions: 20 });
    databaseService.getWorkoutLogsForUser.mockResolvedValue(logsForDates(18)); // 2 left (<= 3)
    seedActiveDraft();

    renderWorkoutTracker();
    await screen.findByText("🏋️ Today's Workout");
    expect(await screen.findByText(/Renew Package/i)).toBeTruthy();
    expect(screen.getByText(/Only 2 sessions left/i)).toBeTruthy();
  });

  it('shows the client\'s own wizard goal (not the mock program name) in the sessions summary', async () => {
    // Analytics view (no active draft) + a coach connection so the accounting
    // split renders. userGoal is what the client picked in the wizard.
    localStorage.setItem('userCoachId', 'coach-1');
    localStorage.setItem('userGoal', 'Muscle Building');
    databaseService.getOwnCoachConnection.mockResolvedValue({ connected: true, resolved: true, totalSessions: 20 });
    databaseService.getWorkoutLogsForUser.mockResolvedValue(logsForDates(4));

    renderWorkoutTracker();
    // Label is reframed as the client's goal, and the value is their real choice.
    expect(await screen.findByText('My Goal')).toBeTruthy();
    expect(screen.getByText('Muscle Building')).toBeTruthy();
    // The random mock program mapped from the goal must NOT be shown to the client.
    expect(screen.queryByText(/Hypertrophy Surge|Body Weights & Dumbbells/)).toBeNull();
  });

  it('shows "Unassigned" (not a mock total) when the coach has not assigned a session count', async () => {
    localStorage.setItem('userCoachId', 'coach-1');
    localStorage.setItem('userGoal', 'Gut Health');
    // Connected to a coach, but no total_sessions assigned yet.
    databaseService.getOwnCoachConnection.mockResolvedValue({ connected: true, resolved: true, totalSessions: 0 });
    databaseService.getWorkoutLogsForUser.mockResolvedValue(logsForDates(4));

    renderWorkoutTracker();
    // Accounting split renders (client is connected), and the remaining count is
    // "Unassigned" rather than "N left" off a random mock package total.
    expect(await screen.findByText('Unassigned')).toBeTruthy();
    expect(screen.queryByText(/left$/)).toBeNull();
    // No renewal prompt should fire off a bogus total either.
    expect(screen.queryByText(/Renew Package/i)).toBeNull();
  });

  it('shows the coach-assigned total when the coach HAS set a session count', async () => {
    localStorage.setItem('userCoachId', 'coach-1');
    localStorage.setItem('userGoal', 'Muscle Building');
    databaseService.getOwnCoachConnection.mockResolvedValue({ connected: true, resolved: true, totalSessions: 24 });
    databaseService.getWorkoutLogsForUser.mockResolvedValue(logsForDates(4)); // 20 left

    renderWorkoutTracker();
    expect(await screen.findByText('4 / 24')).toBeTruthy();
    expect(screen.getByText('20 left')).toBeTruthy();
    expect(screen.queryByText('Unassigned')).toBeNull();
  });
});
