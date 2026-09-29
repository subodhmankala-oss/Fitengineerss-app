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

vi.mock('../utils/alarmSound', () => ({ playAlarmBeeps: vi.fn(), unlockAudio: vi.fn() }));

import databaseService from '../services/databaseService';
import { playAlarmBeeps } from '../utils/alarmSound';
import WorkoutTracker from './WorkoutTracker';
import { TourProvider } from '../context/TourContext';

const renderWorkoutTracker = () => render(<TourProvider><WorkoutTracker /></TourProvider>);

// No jest-dom in this project — plain className check instead of toHaveClass.
const hasClass = (el, cls) => el.className.split(/\s+/).includes(cls);

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
    // Pre-filled from PREV, not yet confirmed — shown as a ghost value.
    expect(hasClass(screen.getByRole('button', { name: '42.5' }), 'set-value-ghost')).toBe(true);
    expect(hasClass(screen.getByRole('button', { name: '9' }), 'set-value-ghost')).toBe(true);
  });

  it('shows PREV-filled values as ghost until confirmed and does not open the keypad on tap', async () => {
    const draft = makeDraft();
    draft.logExercises = [{
      name: 'Bench Press',
      sets: [
        { reps: 9, weight: '42.5', isCompleted: false, weightFromPrev: true, repsFromPrev: true },
        { reps: 7, weight: '45', isCompleted: false, weightFromPrev: true, repsFromPrev: true }
      ]
    }];
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();

    const set1Weight = screen.getByRole('button', { name: '42.5' });
    const set2Weight = screen.getByRole('button', { name: '45' });
    expect(hasClass(set1Weight, 'set-value-ghost')).toBe(true);
    expect(hasClass(set2Weight, 'set-value-ghost')).toBe(true);
    expect(hasClass(set2Weight, 'is-active')).toBe(false);

    fireEvent.click(screen.getAllByTitle('Toggle Complete')[0]);

    // Completing set 1 confirms it (ghost clears); the keypad stays closed.
    await waitFor(() => expect(hasClass(screen.getByRole('button', { name: '42.5' }), 'set-value-ghost')).toBe(false));
    expect(hasClass(screen.getByRole('button', { name: '45' }), 'is-active')).toBe(false);
    expect(hasClass(screen.getByRole('button', { name: '45' }), 'set-value-ghost')).toBe(true);
  });

  it('clears the ghost styling on a set the client edits by hand', async () => {
    const draft = makeDraft();
    draft.logExercises = [{
      name: 'Bench Press',
      sets: [{ reps: 9, weight: '42.5', isCompleted: false, weightFromPrev: true, repsFromPrev: true }]
    }];
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    expect(hasClass(screen.getByRole('button', { name: '42.5' }), 'set-value-ghost')).toBe(true);

    // Open the kg field (desktop: the real on-screen pad never renders, but
    // the same keydown listener that drives it on mobile is still attached,
    // per SetNumberPad's own desktop fallback) and type over the PREV value.
    fireEvent.click(screen.getByRole('button', { name: '42.5' }));
    fireEvent.keyDown(document, { key: '5' });

    const edited = await screen.findByRole('button', { name: '42.55' });
    expect(hasClass(edited, 'set-value-ghost')).toBe(false);
    // Reps wasn't touched, so it's still an unconfirmed guess.
    expect(hasClass(screen.getByRole('button', { name: '9' }), 'set-value-ghost')).toBe(true);
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
    // The rest timer is manual now — ticking a set doesn't start one.
    expect(localStorage.getItem(REST_KEY)).toBeNull();
    // The client only ever resumes their own session's draft, never the coach's.
    expect(databaseService.getWorkoutDraft).toHaveBeenCalledWith('u1', 'self');
  });

  it('starts a rest only from the Start Rest button, and remembers it for a reload', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(makeDraft()));
    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    expect(screen.queryByText('REST TIMER')).toBeNull();

    fireEvent.click(screen.getByText('⏱️ Start Rest'));

    expect(await screen.findByText('REST TIMER')).toBeTruthy();
    await waitFor(() => expect(Number(localStorage.getItem(REST_KEY))).toBeGreaterThan(Date.now()));
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

  it('stops a cardio countdown at 00:00 and beeps once', async () => {
    const draft = makeDraft();
    draft.logExercises = [{
      name: 'Interval running',
      sets: [{ time: '', targetTime: '00:02', distanceKm: '', isCompleted: false }]
    }];
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();

    const setBtn = () => document.querySelector('.btn-cardio-stopwatch');
    fireEvent.click(setBtn());
    expect(setBtn().title).toBe('Pause');
    expect(playAlarmBeeps).not.toHaveBeenCalled();

    // Stops by itself once the 2s target is reached — back to Start, not still running.
    await waitFor(() => expect(setBtn().title).toBe('Start'), { timeout: 4000 });
    expect(playAlarmBeeps).toHaveBeenCalledTimes(1);
    // The saved time is the target, not whatever the wall clock reached.
    expect(screen.getByRole('button', { name: '00:02' })).toBeTruthy();
  });
});
