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

  it('Workout shows only the + start, with no plans or old sub-tabs', async () => {
    renderTab('workouts');
    fireEvent.click(await screen.findByRole('button', { name: 'Start a workout' }));
    expect(await screen.findByText(/Today's Workout/)).toBeTruthy();
    expect(screen.queryByText(/Saved Templates/)).toBeNull();
    expect(screen.queryByText(/Coach Assigned/)).toBeNull();
    expect(screen.queryByText(/Log Sets/)).toBeNull();
  });

  it('Workout links to Library for plans', async () => {
    const onChange = renderTab('workouts');
    fireEvent.click(await screen.findByText(/pick a plan from Library/));
    expect(onChange).toHaveBeenCalledWith('library');
  });

  it('Library shows saved templates, and starting one moves to the Workout tab', async () => {
    const onChange = renderTab('library');
    expect(await screen.findByText(/Saved Templates/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Start/ }).find(b => b.closest('.wt-plan-list')));
    expect(onChange).toHaveBeenCalledWith('workouts');
  });

  it('Library start-empty button moves to the Workout tab', async () => {
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
