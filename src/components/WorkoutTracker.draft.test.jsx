// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

// Mock the Supabase-backed data layer so WorkoutTracker can mount in isolation.
// Every call the component makes on mount resolves to an empty/neutral value.
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
    // WorkoutTracker's debounced draft-autosave effect fires ~1.2s after
    // mount whenever a logging session is active — without these, a test
    // that awaits past that window hits the real setTimeout, calling these
    // as undefined and crashing with "is not a function" (see the same fix
    // in WorkoutTracker.logview.test.jsx).
    getWorkoutDraft: vi.fn().mockResolvedValue(null),
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    BUILTIN_TEMPLATES: []
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});

import WorkoutTracker from './WorkoutTracker';
import { TourProvider } from '../context/TourContext';

// WorkoutTracker calls useTour() (spotlight walkthrough state), which throws
// outside a TourProvider — render through this helper instead of the bare
// component everywhere below.
const renderWorkoutTracker = () => render(<TourProvider><WorkoutTracker /></TourProvider>);

const DRAFT_KEY = 'workoutDraft_u1';

const makeDraft = (exerciseName) => ({
  isLoggingWorkout: true,
  logExercises: [
    { name: exerciseName, sets: [{ reps: 7, weight: '13.5', isCompleted: true, completedAt: Date.now() - 5000 }] }
  ],
  logClient: 'TestClient',
  logDate: '2026-07-15',
  templateName: 'Resumed Leg Day',
  activeTemplateName: 'Resumed Leg Day',
  saveAsTemplate: false,
  workoutTimerStatus: 'running',
  workoutTimerStartedAt: Date.now() - 60000,
  workoutPauseIntervals: [],
  savedAt: Date.now()
});

describe('WorkoutTracker in-progress session persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('restores a half-finished workout from localStorage on mount (survives a tab switch / reload)', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(makeDraft('Bulgarian Split Squat')));

    renderWorkoutTracker();

    // The logging view is shown, not the default analytics view...
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    // ...and the exact exercise the client had entered before leaving is
    // back. The exercise-reorder row legitimately renders its name twice at
    // once (a compact span + the full-view heading, for the drag morph
    // animation) — assert at least one is present rather than assuming a
    // single match.
    expect(screen.getAllByText('Bulgarian Split Squat').length).toBeGreaterThan(0);
  });

  it('shows the default analytics view (no logging form) when there is no saved draft', async () => {
    renderWorkoutTracker();
    // Let mount effects settle.
    await waitFor(() => expect(localStorage.getItem('userName')).toBe('TestClient'));
    expect(screen.queryByText("🏋️ Today's Workout")).toBeNull();
    // No spurious draft written when not logging.
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('ignores a stale draft that is not an active session', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ isLoggingWorkout: false, logExercises: [] }));
    renderWorkoutTracker();
    await waitFor(() => expect(localStorage.getItem('userName')).toBe('TestClient'));
    expect(screen.queryByText("🏋️ Today's Workout")).toBeNull();
    // The non-active draft is cleared out rather than lingering.
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
