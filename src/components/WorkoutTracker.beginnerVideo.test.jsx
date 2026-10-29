// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

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
import databaseService from '../services/databaseService';
import { TourProvider } from '../context/TourContext';

Element.prototype.scrollTo = vi.fn();

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const goblet = [{ name: 'Goblet Squat', sets: [{ reps: 12, weight: '', isCompleted: false }] }];

// A Beginner session open on this phone (local copy), and the server's copy
// of it a moment newer — what reopening the app finds.
const seed = (dbTimerStartedAt) => {
  const startedAt = Date.now() - 60000;
  localStorage.setItem('workoutDraft_u1', JSON.stringify({
    isLoggingWorkout: true, logExercises: goblet, logClient: 'TestClient', logDate: today(),
    templateName: 'Beginner Full Body A', activeTemplateName: '', loggingLevel: 'beginner',
    saveAsTemplate: false, workoutTimerStatus: 'running', workoutTimerStartedAt: startedAt,
    workoutPauseIntervals: [], savedAt: Date.now() - 5000
  }));
  databaseService.getWorkoutDraft.mockResolvedValue({
    userId: 'u1', source: 'self', planName: 'Beginner Full Body A', logDate: today(), exercises: goblet,
    timerStatus: 'running', timerStartedAt: dbTimerStartedAt ?? startedAt, pauseIntervals: [],
    updatedAt: new Date().toISOString()
  });
};

describe('Beginner inline form video after the server draft is restored', () => {
  beforeEach(() => {
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    databaseService.getExerciseLibrary.mockResolvedValue([{ name: 'Goblet Squat', video_url: 'https://example.com/goblet.mp4' }]);
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('keeps the video for the same session', async () => {
    seed();
    render(<TourProvider><WorkoutTracker /></TourProvider>);
    expect((await screen.findAllByText('Goblet Squat')).length).toBeGreaterThan(0);
    await waitFor(() => expect(databaseService.getWorkoutDraft).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('.beginner-ex-video')).not.toBeNull());
  });

  it('drops the level when the server copy is a different session', async () => {
    seed(Date.now() - 3600000);
    render(<TourProvider><WorkoutTracker /></TourProvider>);
    expect((await screen.findAllByText('Goblet Squat')).length).toBeGreaterThan(0);
    await waitFor(() => expect(databaseService.getWorkoutDraft).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('.beginner-ex-video')).toBeNull());
  });
});
