// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// Same isolated data layer as WorkoutTracker.oneTap.test.jsx.
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

import WorkoutTracker from './WorkoutTracker';

const renderWorkoutTracker = () => render(<WorkoutTracker />);

// No jest-dom in this project — plain className check instead of toHaveClass.
const hasClass = (el, cls) => el.className.split(/\s+/).includes(cls);

// Top tabs, workout header and the "enter your reps" tip.
const tucks = () => ['tabs-tuck', 'header-tuck', 'tip-tuck'].map(id => hasClass(screen.getByTestId(id), 'is-tucked'));
const tucked = () => tucks().every(Boolean);
const untucked = () => !tucks().some(Boolean);

const DRAFT_KEY = 'workoutDraft_u1';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const draft = () => ({
  isLoggingWorkout: true,
  logExercises: [
    { name: 'Bench Press', sets: [{ reps: 10, weight: '40', isCompleted: false }, { reps: 9, weight: '42.5', isCompleted: false }] },
    { name: 'Barbell Squat', sets: [{ reps: 8, weight: '60', isCompleted: false }] }
  ],
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

describe('WorkoutTracker full-screen after a tick', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.body.classList.remove('workout-full-screen');
  });

  it('ticking a set hides the tabs and navbar, keeps the whole workout, and the down arrow brings them back', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft()));
    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    expect(untucked()).toBe(true);
    expect(screen.queryByTestId('full-screen-exit')).toBeNull();

    fireEvent.click(document.querySelectorAll('.btn-hevy-check')[0]);

    expect(tucked()).toBe(true);
    expect(hasClass(document.body, 'workout-full-screen')).toBe(true);
    // Everything else stays: both exercises, every set, Save.
    expect(screen.getAllByText('Barbell Squat').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.hevy-set-row').length).toBe(3);
    expect(screen.getByText('Save Workout Session')).toBeTruthy();

    fireEvent.click(screen.getByTestId('full-screen-exit'));
    expect(untucked()).toBe(true);
    expect(hasClass(document.body, 'workout-full-screen')).toBe(false);
    expect(screen.queryByTestId('full-screen-exit')).toBeNull();

    // The next tick goes full-screen again.
    fireEvent.click(document.querySelectorAll('.btn-hevy-check')[2]);
    expect(tucked()).toBe(true);
  });

  it('Save with no workout name brings the whole screen back and points at the name box', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft(), templateName: '' }));
    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    document.querySelectorAll('.btn-hevy-check').forEach(b => fireEvent.click(b));
    expect(tucked()).toBe(true);

    fireEvent.click(screen.getByText('Save Workout Session'));

    expect(untucked()).toBe(true);
    expect(hasClass(document.body, 'workout-full-screen')).toBe(false);
    await waitFor(() => expect(document.activeElement?.id).toBe('workoutNameInputTop'), { timeout: 5000 });
  });
});
