// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { TourProvider } from '../context/TourContext';

// Same neutral databaseService as WorkoutTracker.pendingAdds.test.jsx.
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
    checkAndHandleSessionPackageCompletion: vi.fn().mockResolvedValue({}),
    BUILTIN_TEMPLATES: [],
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});

import WorkoutTracker from './WorkoutTracker';
import { getWorkoutLeftovers, updateWorkoutLeftovers } from '../utils/workoutLeftovers';

const exerciseNames = () => Array.from(document.querySelectorAll('.ex-name-clickable')).map(n => n.textContent);

function startWithDraft(logExercises) {
  localStorage.setItem('userName', 'TestClient');
  localStorage.setItem('userId', 'u1');
  localStorage.setItem('workoutDraft_u1', JSON.stringify({
    isLoggingWorkout: true,
    logExercises,
    logClient: 'TestClient', logDate: '2026-10-12', templateName: 'Leg Day', activeTemplateName: 'Leg Day',
    saveAsTemplate: false, workoutTimerStatus: 'running', workoutTimerStartedAt: Date.now() - 60000,
    workoutPauseIntervals: [], savedAt: Date.now(),
  }));
  render(<TourProvider><WorkoutTracker /></TourProvider>);
}

describe('Skipped exercises carried over to the next workout', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('out of time: finish and move the not-started exercises', async () => {
    startWithDraft([
      { name: 'Squat', sets: [{ reps: 8, weight: '60', isCompleted: true, completedAt: Date.now() - 30000 }, { reps: 8, weight: '60', isCompleted: false }] },
      { name: 'Leg Curl', sets: [{ reps: 12, weight: '30', isCompleted: false }] },
      { name: 'Calf Raise', sets: [{ reps: 15, weight: '40', isCompleted: false }] },
    ]);
    await waitFor(() => expect(exerciseNames()).toEqual(['Squat', 'Leg Curl', 'Calf Raise']));

    fireEvent.click(screen.getByText('💾 Save Workout Session'));
    fireEvent.click(await screen.findByText('⏭ Finish & move 2 to next workout'));
    expect(screen.getByText(/Moving to your next workout/).textContent).toContain('Leg Curl, Calf Raise');

    fireEvent.click(screen.getByText('Confirm Save'));
    await waitFor(() => expect(getWorkoutLeftovers('u1').map(it => it.name)).toEqual(['Leg Curl', 'Calf Raise']));
    expect(getWorkoutLeftovers('u1')[0]).toMatchObject({ date: '2026-10-12', planName: 'Leg Day' });
  });

  it('no move option when nothing has been done yet', async () => {
    startWithDraft([{ name: 'Leg Curl', sets: [{ reps: 12, weight: '30', isCompleted: false }] }]);
    await waitFor(() => expect(exerciseNames()).toEqual(['Leg Curl']));
    fireEvent.click(screen.getByText('💾 Save Workout Session'));
    await screen.findByText('Empty Workout Session');
    expect(screen.queryByText(/to next workout/)).toBeNull();
  });

  it('next workout: the card adds them, or they can be dismissed', async () => {
    updateWorkoutLeftovers('u1', { skipped: ['Leg Curl', 'Calf Raise', 'Biceps Curls'], date: '2026-10-12' });
    startWithDraft([{ name: 'Biceps Curls', sets: [{ reps: 10, weight: '10', isCompleted: false }] }]);
    await waitFor(() => expect(exerciseNames()).toEqual(['Biceps Curls']));

    // Already in today's workout → not offered again.
    const card = await screen.findByTestId('leftover-card');
    expect(Array.from(card.querySelectorAll('li')).map(li => li.textContent)).toEqual(['Leg Curl', 'Calf Raise']);

    fireEvent.click(screen.getByText('+ Add all 2'));
    await waitFor(() => expect(exerciseNames()).toEqual(['Biceps Curls', 'Leg Curl', 'Calf Raise']));
    expect(screen.queryByTestId('leftover-card')).toBeNull();
    expect(getWorkoutLeftovers('u1').map(it => it.name)).toEqual(['Biceps Curls']);
  });

  it('dismiss clears them', async () => {
    updateWorkoutLeftovers('u1', { skipped: ['Leg Curl'], date: '2026-10-12' });
    startWithDraft([{ name: 'Biceps Curls', sets: [{ reps: 10, weight: '10', isCompleted: false }] }]);
    fireEvent.click(await screen.findByText('Dismiss'));
    expect(screen.queryByTestId('leftover-card')).toBeNull();
    expect(getWorkoutLeftovers('u1')).toEqual([]);
  });
});
