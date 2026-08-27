// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import { TourProvider } from '../context/TourContext';

// Mirrors the existing WorkoutTracker.draft.test.jsx mocking approach: a
// neutral databaseService so the component can mount from a localStorage
// draft without a real backend.
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

const DRAFT_KEY = 'workoutDraft_u1';

function makeDraft() {
  return {
    isLoggingWorkout: true,
    logExercises: [
      { name: 'Shoulder Press (Dumbbell)', sets: [{ reps: 9, weight: '2.5', isCompleted: false }] },
      { name: 'Biceps Curls', sets: [{ reps: 15, weight: '2.5', isCompleted: false }] },
    ],
    logClient: 'TestClient',
    logDate: '2026-08-20',
    templateName: 'Upper Body',
    activeTemplateName: 'Upper Body',
    saveAsTemplate: false,
    workoutTimerStatus: 'running',
    workoutTimerStartedAt: Date.now() - 60000,
    workoutPauseIntervals: [],
    savedAt: Date.now(),
  };
}

describe('Exercise name click (post-reorder scroll-reset regression)', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('still opens the exercise history modal on click', async () => {
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    localStorage.setItem(DRAFT_KEY, JSON.stringify(makeDraft()));

    render(<TourProvider><WorkoutTracker /></TourProvider>);
    await screen.findByText("🏋️ Today's Workout");

    const nameEl = await waitFor(() => {
      const el = Array.from(document.querySelectorAll('.ex-name-clickable'))
        .find((n) => n.textContent === 'Shoulder Press (Dumbbell)');
      expect(el).toBeTruthy();
      return el;
    });

    act(() => {
      nameEl.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    // The history sheet renders exercise-scoped range tabs (Daily/Weekly/
    // Monthly/Yearly) once open — proof the click still reaches onClick.
    await waitFor(() => expect(screen.getByText('Daily')).toBeTruthy());
  });

  it("suppresses the element's default pointerdown action (the browser's tap-to-focus-and-scroll behavior)", async () => {
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    localStorage.setItem(DRAFT_KEY, JSON.stringify(makeDraft()));

    render(<TourProvider><WorkoutTracker /></TourProvider>);
    await screen.findByText("🏋️ Today's Workout");

    const nameEl = await waitFor(() => {
      const el = Array.from(document.querySelectorAll('.ex-name-clickable'))
        .find((n) => n.textContent === 'Shoulder Press (Dumbbell)');
      expect(el).toBeTruthy();
      return el;
    });

    const event = new window.PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    act(() => {
      nameEl.dispatchEvent(event);
    });

    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});
