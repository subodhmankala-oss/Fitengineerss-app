// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// Same isolated data layer as WorkoutTracker.draft.test.jsx.
vi.mock('../services/databaseService', () => {
  const svc = {
    getDefaultWorkoutTemplates: vi.fn().mockResolvedValue([]),
    getGenericWorkoutsByLevel: vi.fn().mockResolvedValue([]),
    getWorkoutPlansForUser: vi.fn().mockResolvedValue([]),
    getOwnCoachConnection: vi.fn().mockResolvedValue({ connected: false }),
    resolveUserId: vi.fn().mockResolvedValue('u1'),
    getWorkoutLogsForUser: vi.fn().mockResolvedValue([]),
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
    saveWorkoutSession: vi.fn().mockResolvedValue(undefined),
    saveWorkoutPlan: vi.fn().mockResolvedValue(undefined),
    getWorkoutDraft: vi.fn().mockResolvedValue(null),
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    deleteWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    BUILTIN_TEMPLATES: []
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});

import databaseService from '../services/databaseService';
import WorkoutTracker from './WorkoutTracker';
import { TourProvider } from '../context/TourContext';

const renderWorkoutTracker = () => render(<TourProvider><WorkoutTracker /></TourProvider>);

const DRAFT_KEY = 'workoutDraft_u1';
const REST_KEY = 'workoutRestEndAt_u1';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const makeDraft = () => ({
  isLoggingWorkout: true,
  logExercises: [{ name: 'Bench Press', sets: [{ reps: 8, weight: '40', isCompleted: false }] }],
  logClient: 'TestClient',
  logDate: today(),
  templateName: 'Push Day',
  activeTemplateName: 'Push Day',
  saveAsTemplate: false,
  workoutTimerStatus: 'idle',
  workoutTimerStartedAt: null,
  workoutPauseIntervals: [],
  savedAt: Date.now()
});

describe('WorkoutTracker one-tap set logging', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('fills PREV into a session auto-started before the history had loaded', async () => {
    // The Home banner's auto-start runs on mount, while the history read is
    // still in flight — the kg boxes used to stay at 0.
    localStorage.setItem('workoutTrackerAutoStart_u1', JSON.stringify({
      name: 'Push Day',
      exercises: [{ name: 'Bench Press', sets: 2, reps: '8–10' }]
    }));
    let deliverLogs;
    databaseService.getWorkoutLogsForUser.mockReturnValueOnce(new Promise(resolve => { deliverLogs = resolve; }));

    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    await waitFor(() => expect(deliverLogs).toBeTypeOf('function'));

    deliverLogs([
      { log_date: '2026-09-01', exercise_name: 'Bench Press', set_number: 1, reps: 9, weight_kg: 42.5 },
      { log_date: '2026-09-01', exercise_name: 'Bench Press', set_number: 2, reps: 7, weight_kg: 45 }
    ]);

    expect(await screen.findByRole('button', { name: '42.5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '45' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '9' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '7' })).toBeTruthy();
  });

  it('saves the draft right away when a set is ticked, instead of after the debounce', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(makeDraft()));
    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    // Let the mount-time debounced save go out first.
    await waitFor(() => expect(databaseService.saveWorkoutDraft).toHaveBeenCalled(), { timeout: 3000 });
    databaseService.saveWorkoutDraft.mockClear();

    fireEvent.click(screen.getByTitle('Toggle Complete'));

    // Inside the 1.2s debounce window.
    await waitFor(() => expect(databaseService.saveWorkoutDraft).toHaveBeenCalled(), { timeout: 1000 });
    const saved = databaseService.saveWorkoutDraft.mock.calls[0][0];
    expect(saved.exercises[0].sets[0].isCompleted).toBe(true);
    // ...and the rest countdown it started is remembered for a reload.
    expect(Number(localStorage.getItem(REST_KEY))).toBeGreaterThan(Date.now());
    // The client only ever resumes their own session's draft, never the coach's.
    expect(databaseService.getWorkoutDraft).toHaveBeenCalledWith('u1', 'self');
  });

  it('restores a rest countdown that was running when the page reloaded', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(makeDraft()));
    localStorage.setItem(REST_KEY, String(Date.now() + 45000));
    renderWorkoutTracker();
    expect(await screen.findByText('REST TIMER')).toBeTruthy();
  });

  it('does not restore a rest that already ran out', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(makeDraft()));
    localStorage.setItem(REST_KEY, String(Date.now() - 1000));
    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    expect(screen.queryByText('REST TIMER')).toBeNull();
    expect(localStorage.getItem(REST_KEY)).toBeNull();
  });
});
