// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../services/databaseService', () => {
  const svc = {
    getDefaultWorkoutTemplates: vi.fn().mockResolvedValue([]),
    getGenericWorkoutsByLevel: vi.fn().mockResolvedValue([]),
    getWorkoutPlansForUser: vi.fn().mockResolvedValue([]),
    getOwnCoachConnection: vi.fn().mockResolvedValue({ connected: false, resolved: true }),
    resolveUserId: vi.fn().mockResolvedValue('u1'),
    getWorkoutLogsForUser: vi.fn().mockResolvedValue([]),
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
    getWorkoutDraft: vi.fn().mockResolvedValue(null),
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    BUILTIN_TEMPLATES: []
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});

import WorkoutTracker from './WorkoutTracker';
import { TourProvider } from '../context/TourContext';
import { queueWorkoutAdd, getPendingWorkoutAdds } from '../utils/pendingWorkoutAdds';

Element.prototype.scrollTo = vi.fn();

const renderTab = (clientTab, onClientTabChange = vi.fn()) => {
  render(<TourProvider><WorkoutTracker clientTab={clientTab} onClientTabChange={onClientTabChange} /></TourProvider>);
  return onClientTabChange;
};

describe('WorkoutTracker on the client bottom-nav tabs', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
  });
  afterEach(cleanup);

  it('Workout shows the launcher with no old sub-tabs', async () => {
    renderTab('workouts');
    expect(await screen.findByText('Start Empty Workout')).toBeTruthy();
    expect(screen.getByText(/Saved Templates/)).toBeTruthy();
    expect(screen.queryByText(/Log Sets/)).toBeNull();
  });

  it('Library shows the programs, and starting a workout there moves to the Workout tab', async () => {
    const onChange = renderTab('library');
    fireEvent.click(await screen.findByText('+ Start empty workout'));
    expect(onChange).toHaveBeenCalledWith('workouts');
  });

  it('Metrics Progress shows Training Level', async () => {
    renderTab('progress');
    expect(await screen.findByText(/Training Level/)).toBeTruthy();
  });

  it('Metrics Progress leaves queued exercises for the Workout tab', async () => {
    queueWorkoutAdd('Bench Press');
    const onChange = renderTab('progress');
    await screen.findByText(/Training Level/);
    await new Promise(r => setTimeout(r, 50));
    expect(onChange).not.toHaveBeenCalled();
    expect(getPendingWorkoutAdds()).toContain('Bench Press');
  });
});
