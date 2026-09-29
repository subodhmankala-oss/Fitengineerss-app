// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

vi.mock('../services/databaseService', () => {
  const svc = {
    getDefaultWorkoutTemplates: vi.fn().mockResolvedValue([]),
    getGenericWorkoutsByLevel: vi.fn().mockResolvedValue([]),
    getWorkoutPlansForUser: vi.fn().mockResolvedValue([]),
    getOwnCoachConnection: vi.fn().mockResolvedValue({ connected: false, resolved: true }),
    resolveUserId: vi.fn().mockResolvedValue('u1'),
    getWorkoutLogsForUser: vi.fn().mockResolvedValue([]),
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
    saveWorkoutSession: vi.fn().mockResolvedValue(undefined),
    saveWorkoutPlan: vi.fn().mockResolvedValue(undefined),
    getWorkoutDraft: vi.fn().mockResolvedValue(null),
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    BUILTIN_TEMPLATES: []
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});
vi.mock('../utils/pushNotify', () => ({ notifyEvent: vi.fn() }));

import WorkoutTracker from './WorkoutTracker';
import { notifyEvent } from '../utils/pushNotify';
import { TourProvider } from '../context/TourContext';

// jsdom has no Element.scrollTo; the analytics chart calls it on mount.
Element.prototype.scrollTo = vi.fn();

const T0 = 1_790_000_000_000;
let now = T0;
let dateSpy;

const renderWorkoutTracker = () => render(<TourProvider><WorkoutTracker /></TourProvider>);
const clockText = () => document.querySelector('.hevy-stopwatch-banner .stopwatch-time')?.textContent;

describe('WorkoutTracker workout clock', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    // Open straight on Log Sets, where "Start Empty Workout" lives.
    localStorage.setItem('workoutTrackerLastTab_u1', 'log');
    now = T0;
    dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });

  afterEach(() => {
    cleanup();
    dateSpy.mockRestore();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('starts when the workout is started, not at the first ticked set', async () => {
    renderWorkoutTracker();
    fireEvent.click(await screen.findByText('Start Empty Workout'));

    expect(screen.queryByText('Timer starts when you log your first set')).toBeNull();
    expect(clockText()).toBe('00:00');

    // Warm-up done without ticking anything; the phone was off screen.
    now = T0 + 95_000;
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(clockText()).toBe('01:35');
  });

  it('tells the coach on the first ticked set, not when the workout is opened', async () => {
    renderWorkoutTracker();
    fireEvent.click(await screen.findByText('Start Empty Workout'));
    expect(notifyEvent).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByTitle('Toggle Complete')[0]);
    expect(notifyEvent).toHaveBeenCalledTimes(1);
    expect(notifyEvent).toHaveBeenCalledWith('workout_started', expect.objectContaining({ clientUserId: expect.any(String) }));

    fireEvent.click(screen.getAllByTitle('Toggle Complete')[1]);
    expect(notifyEvent).toHaveBeenCalledTimes(1);
  });
});
