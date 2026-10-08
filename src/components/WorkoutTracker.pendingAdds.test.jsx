// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { TourProvider } from '../context/TourContext';

// Same neutral databaseService as WorkoutTracker.exerciseNameClick.test.jsx.
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
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    deleteWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    getWorkoutDraft: vi.fn().mockResolvedValue(null),
    saveWorkoutPlan: vi.fn().mockResolvedValue(undefined),
    BUILTIN_TEMPLATES: [],
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});

import WorkoutTracker from './WorkoutTracker';
import { queueWorkoutAdd, getPendingWorkoutAdds } from '../utils/pendingWorkoutAdds';

const exerciseNames = () => Array.from(document.querySelectorAll('.ex-name-clickable')).map(n => n.textContent);

describe('Exercises queued from the muscle detail screen', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('start a workout with them when none is in progress', async () => {
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    expect(queueWorkoutAdd('Back Extension')).toBe(true);
    expect(queueWorkoutAdd('back extension')).toBe(false); // de-duped

    render(<TourProvider><WorkoutTracker /></TourProvider>);
    await screen.findByText("🏋️ Today's Workout");
    await waitFor(() => expect(exerciseNames()).toContain('Back Extension'));
    expect(getPendingWorkoutAdds()).toEqual([]);
  });

  it('are appended to a workout already in progress', async () => {
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    localStorage.setItem('workoutDraft_u1', JSON.stringify({
      isLoggingWorkout: true,
      logExercises: [{ name: 'Biceps Curls', sets: [{ reps: 15, weight: '2.5', isCompleted: false }] }],
      logClient: 'TestClient', logDate: '2026-08-20', templateName: 'Upper Body', activeTemplateName: 'Upper Body',
      saveAsTemplate: false, workoutTimerStatus: 'running', workoutTimerStartedAt: Date.now() - 60000,
      workoutPauseIntervals: [], savedAt: Date.now(),
    }));
    queueWorkoutAdd('External Rotation (Cable)');

    render(<TourProvider><WorkoutTracker /></TourProvider>);
    await waitFor(() => expect(exerciseNames()).toEqual(['Biceps Curls', 'External Rotation (Cable)']));
  });
});
