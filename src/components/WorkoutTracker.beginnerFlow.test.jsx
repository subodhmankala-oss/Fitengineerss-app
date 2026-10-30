// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';

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
    getLibraryProgramLevel: vi.fn(name => Promise.resolve(/^(Home )?Beginner /.test(name) ? 'beginner' : null)),
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    BUILTIN_TEMPLATES: []
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});
vi.mock('../utils/pushNotify', () => ({ notifyEvent: vi.fn() }));

import WorkoutTracker from './WorkoutTracker';
import databaseService from '../services/databaseService';
import { TourProvider } from '../context/TourContext';
import { startLibraryProgram } from '../utils/startLibraryProgram';

Element.prototype.scrollTo = vi.fn();

const program = { name: 'Beginner Full Body A', exercises: ['Goblet Squat', 'Push-up', 'Dumbbell Row', 'Plank'].map(name => ({ name, sets: 3, reps: '10' })) };
const videos = () => document.querySelectorAll('.beginner-ex-video').length;

describe('Beginner series: Home card → logger → leave and come back', () => {
  beforeEach(() => {
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    databaseService.getWorkoutDraft.mockResolvedValue(null);
    databaseService.getLibraryProgramLevel.mockImplementation(name => Promise.resolve(/^(Home )?Beginner /.test(name) ? 'beginner' : null));
    databaseService.getExerciseLibrary.mockResolvedValue(
      program.exercises.map(e => ({ name: e.name, video_url: `https://example.com/${e.name}.mp4` }))
    );
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('shows the videos when started from the Home card', async () => {
    startLibraryProgram('u1', 'gym', 'beginner', program);
    render(<TourProvider><WorkoutTracker /></TourProvider>);
    await waitFor(() => expect(videos()).toBeGreaterThan(0));
  });

  it('still shows them after switching tabs and back (server copy of this session is newer)', async () => {
    startLibraryProgram('u1', 'gym', 'beginner', program);
    const first = render(<TourProvider><WorkoutTracker /></TourProvider>);
    await waitFor(() => expect(videos()).toBeGreaterThan(0));
    // The server copy of the open session, saved a moment after the local one.
    await act(async () => { await new Promise(r => setTimeout(r, 1500)); });
    const saved = databaseService.saveWorkoutDraft.mock.calls.at(-1)?.[0];
    expect(saved).toBeTruthy();
    databaseService.getWorkoutDraft.mockResolvedValue({ ...saved, updatedAt: new Date(Date.now() + 5000).toISOString() });
    first.unmount();

    render(<TourProvider><WorkoutTracker /></TourProvider>);
    expect((await screen.findAllByText('Push-up')).length).toBeGreaterThan(0);
    await waitFor(() => expect(databaseService.getWorkoutDraft).toHaveBeenCalled());
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(videos()).toBeGreaterThan(0);
  });

  it('heals an open Beginner session saved on this phone without its level (older build)', async () => {
    const d = new Date();
    localStorage.setItem('workoutDraft_u1', JSON.stringify({
      isLoggingWorkout: true,
      logExercises: program.exercises.map(e => ({ name: e.name, sets: [{ reps: 10, weight: '', isCompleted: false }] })),
      logClient: 'TestClient', logDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      templateName: 'Beginner Full Body A', activeTemplateName: '', loggingLevel: null, saveAsTemplate: false,
      workoutTimerStatus: 'running', workoutTimerStartedAt: Date.now() - 60000, workoutPauseIntervals: [], savedAt: Date.now()
    }));
    render(<TourProvider><WorkoutTracker /></TourProvider>);
    await waitFor(() => expect(videos()).toBeGreaterThan(0));
  });

  it('gives a non-library session no videos', async () => {
    const d = new Date();
    localStorage.setItem('workoutDraft_u1', JSON.stringify({
      isLoggingWorkout: true,
      logExercises: [{ name: 'Push-up', sets: [{ reps: 10, weight: '', isCompleted: false }] }],
      logClient: 'TestClient', logDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      templateName: 'My Push Day', activeTemplateName: '', loggingLevel: null, saveAsTemplate: false,
      workoutTimerStatus: 'running', workoutTimerStartedAt: Date.now() - 60000, workoutPauseIntervals: [], savedAt: Date.now()
    }));
    render(<TourProvider><WorkoutTracker /></TourProvider>);
    expect((await screen.findAllByText('Push-up')).length).toBeGreaterThan(0);
    await waitFor(() => expect(databaseService.getLibraryProgramLevel).toHaveBeenCalledWith('My Push Day'));
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(videos()).toBe(0);
  });

  it('still shows them when the session is reopened from the server copy only (local copy gone)', async () => {
    startLibraryProgram('u1', 'gym', 'beginner', program);
    const first = render(<TourProvider><WorkoutTracker /></TourProvider>);
    await waitFor(() => expect(videos()).toBeGreaterThan(0));
    await act(async () => { await new Promise(r => setTimeout(r, 1500)); });
    const saved = databaseService.saveWorkoutDraft.mock.calls.at(-1)?.[0];
    databaseService.getWorkoutDraft.mockResolvedValue({ ...saved, updatedAt: new Date().toISOString() });
    first.unmount();
    localStorage.removeItem('workoutDraft_u1');

    render(<TourProvider><WorkoutTracker /></TourProvider>);
    expect((await screen.findAllByText('Push-up')).length).toBeGreaterThan(0);
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(videos()).toBeGreaterThan(0);
  });
});
