// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

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

const DRAFT_KEY = 'workoutDraft_u1';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const draft = () => ({
  isLoggingWorkout: true,
  logExercises: [
    { name: 'Arm Circle', sets: [{ reps: '10', weight: '0', isCompleted: false, isWarmup: true, setType: 'warmup' }] },
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

const rowOf = (name) => screen.getAllByText(name)[0].closest('.ex-reorder-row');

describe('WorkoutTracker focus mode', () => {
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

  it('ticking a set leaves only that exercise on screen until the chevron is tapped', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft()));
    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    expect(screen.queryByTestId('focus-show-all')).toBeNull();

    const benchRow = rowOf('Bench Press');
    fireEvent.click(benchRow.querySelectorAll('.btn-hevy-check')[0]);

    expect(hasClass(rowOf('Arm Circle'), 'focus-hidden')).toBe(true);
    expect(hasClass(rowOf('Barbell Squat'), 'focus-hidden')).toBe(true);
    expect(hasClass(benchRow, 'focus-hidden')).toBe(false);
    expect(screen.queryByText('Save Workout Session')).toBeNull();
    const chevron = screen.getByTestId('focus-show-all');
    expect(chevron.textContent).toContain('Barbell Squat');

    // A second tick keeps the focus.
    fireEvent.click(benchRow.querySelectorAll('.btn-hevy-check')[1]);
    expect(hasClass(rowOf('Barbell Squat'), 'focus-hidden')).toBe(true);

    fireEvent.click(chevron);
    expect(hasClass(rowOf('Barbell Squat'), 'focus-hidden')).toBe(false);
    expect(screen.getByText('Save Workout Session')).toBeTruthy();

    // Ticking the next exercise focuses that one.
    fireEvent.click(rowOf('Barbell Squat').querySelector('.btn-hevy-check'));
    expect(hasClass(rowOf('Bench Press'), 'focus-hidden')).toBe(true);
    expect(hasClass(rowOf('Barbell Squat'), 'focus-hidden')).toBe(false);
  });
});
