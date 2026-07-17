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
    BUILTIN_TEMPLATES: []
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});

import WorkoutTracker from './WorkoutTracker';

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

    render(<WorkoutTracker />);

    // The logging view is shown, not the default analytics view...
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    // ...and the exact exercise the client had entered before leaving is back.
    expect(screen.getByText('Bulgarian Split Squat')).toBeTruthy();
  });

  it('shows the default analytics view (no logging form) when there is no saved draft', async () => {
    render(<WorkoutTracker />);
    // Let mount effects settle.
    await waitFor(() => expect(localStorage.getItem('userName')).toBe('TestClient'));
    expect(screen.queryByText("🏋️ Today's Workout")).toBeNull();
    // No spurious draft written when not logging.
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('ignores a stale draft that is not an active session', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ isLoggingWorkout: false, logExercises: [] }));
    render(<WorkoutTracker />);
    await waitFor(() => expect(localStorage.getItem('userName')).toBe('TestClient'));
    expect(screen.queryByText("🏋️ Today's Workout")).toBeNull();
    // The non-active draft is cleared out rather than lingering.
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
