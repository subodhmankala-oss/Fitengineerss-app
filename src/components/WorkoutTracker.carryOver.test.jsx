// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

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
    getWorkoutLeftoversRemote: vi.fn().mockResolvedValue(null),
    saveWorkoutLeftoversRemote: vi.fn().mockResolvedValue(true),
    checkAndHandleSessionPackageCompletion: vi.fn().mockResolvedValue({}),
    BUILTIN_TEMPLATES: []
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});

vi.mock('../utils/alarmSound', () => ({ playAlarmBeeps: vi.fn(), unlockAudio: vi.fn() }));

import databaseService from '../services/databaseService';
import WorkoutTracker from './WorkoutTracker';
import { TourProvider } from '../context/TourContext';
import { getWorkoutLeftovers } from '../utils/workoutLeftovers';

const renderWorkoutTracker = () => render(<TourProvider><WorkoutTracker /></TourProvider>);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const seedDraft = (exercises) => localStorage.setItem('workoutDraft_u1', JSON.stringify({
  isLoggingWorkout: true,
  logExercises: exercises,
  logClient: 'TestClient',
  logDate: today(),
  templateName: 'Upper Body',
  activeTemplateName: 'Upper Body',
  saveAsTemplate: false,
  workoutTimerStatus: 'running',
  workoutTimerStartedAt: Date.now() - 20 * 60 * 1000,
  workoutPauseIntervals: [],
  savedAt: Date.now()
}));

const done = { reps: 8, weight: '40', isCompleted: true, completedAt: Date.now() - 60000 };
const todo = { reps: 12, weight: '10', isCompleted: false };

describe("Client logger: keep not-started exercises for next session", { timeout: 30000 }, () => {
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

  it('shows the tick box above Save and saves straight away with them carried over', async () => {
    seedDraft([
      { name: 'Bench Press', sets: [done, done] },
      { name: 'Reverse Fly', sets: [todo, todo] },
      { name: 'Cable Shrug', sets: [todo] }
    ]);
    renderWorkoutTracker();

    const box = await screen.findByTestId('client-carry-over', {}, { timeout: 15000 });
    expect(box.textContent).toContain('Keep 2 exercises for next session');
    expect(box.textContent).toContain('Reverse Fly, Cable Shrug');

    fireEvent.click(screen.getByText('💾 Save Workout Session'));
    // No "unticked sets" warning: only whole exercises were left.
    expect(screen.queryByText("Some sets aren't ticked")).toBeNull();
    fireEvent.click(await screen.findByText('Confirm Save'));

    await waitFor(() => expect(getWorkoutLeftovers('u1').map(it => it.name)).toEqual(['Reverse Fly', 'Cable Shrug']));
    expect(databaseService.saveWorkoutLeftoversRemote).toHaveBeenCalledWith('u1', expect.arrayContaining([expect.objectContaining({ name: 'Reverse Fly' })]));
  });

  it('a started exercise with an unticked set still asks first', async () => {
    seedDraft([
      { name: 'Bench Press', sets: [done, todo] },
      { name: 'Reverse Fly', sets: [todo] }
    ]);
    renderWorkoutTracker();
    await screen.findByTestId('client-carry-over', {}, { timeout: 15000 });

    fireEvent.click(screen.getByText('💾 Save Workout Session'));
    expect(await screen.findByText("Some sets aren't ticked")).toBeTruthy();
    expect(screen.queryByText('Empty Workout Session')).toBeNull();
  });
});
