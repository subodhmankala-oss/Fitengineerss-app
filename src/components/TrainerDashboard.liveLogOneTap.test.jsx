// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// Isolated data layer: the handful of calls this test cares about are real
// mocks below; every other method TrainerDashboard touches on mount resolves
// to an empty list, which is what each of them returns for "nothing yet".
const CLIENT = { id: 'c1', userName: 'Asha', email: 'asha@example.com', role: 'client' };
vi.mock('../services/databaseService', () => {
  const known = {
    resolveUserId: vi.fn().mockResolvedValue('coach1'),
    getAllUsers: vi.fn(),
    getWorkoutDraft: vi.fn(),
    getWorkoutLogsForUser: vi.fn(),
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    deleteWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    getLatestCoachNoteSentAt: vi.fn().mockResolvedValue(null),
    getCoachReminderAssets: vi.fn().mockResolvedValue(null),
    getPlatformStats: vi.fn().mockResolvedValue({ totalWorkoutsLoggedThisWeek: 0, totalActiveClients: 0 }),
    supabase: null
  };
  const svc = new Proxy(known, {
    get(target, prop) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    }
  });
  return { __esModule: true, default: svc, isSuperAdmin: () => false, isSupabaseConfigured: false };
});

import databaseService from '../services/databaseService';
import TrainerDashboard from './TrainerDashboard';
import { CoachTourProvider } from '../context/CoachTourContext';

const renderLiveLog = () => render(
  <CoachTourProvider>
    <TrainerDashboard handleLogout={() => {}} deepLinkClient={{ id: CLIENT.id, tab: 'livelog', nonce: 1 }} />
  </CoachTourProvider>
);

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

describe('Coach Live Log one-tap set logging', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userId', 'coach1');
    localStorage.setItem('userRole', 'coach');
    localStorage.setItem('coachTourSeen', 'true');
    vi.clearAllMocks();
    databaseService.getAllUsers.mockResolvedValue([CLIENT]);
    databaseService.getWorkoutDraft.mockResolvedValue(null);
    databaseService.getWorkoutLogsForUser.mockResolvedValue([]);
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('gives sets created before the client history loaded their PREV kg once it lands', async () => {
    const logs = deferred();
    databaseService.getWorkoutLogsForUser.mockReturnValueOnce(logs.promise);
    renderLiveLog();

    // Starter exercise, opened while the history fetch is still pending.
    expect((await screen.findAllByText('Shoulders Press')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '20' }).length).toBe(2);

    logs.resolve([
      { log_date: '2026-09-01', exercise_name: 'Shoulders Press', set_number: 1, reps: 10, weight_kg: 32.5 },
      { log_date: '2026-09-01', exercise_name: 'Shoulders Press', set_number: 2, reps: 8, weight_kg: 35 }
    ]);

    expect(await screen.findByRole('button', { name: '32.5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '35' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '20' })).toBeNull();
  });

  it('saves the draft right away when a set is ticked, instead of after the debounce', async () => {
    renderLiveLog();
    expect((await screen.findAllByText('Shoulders Press')).length).toBeGreaterThan(0);
    await waitFor(() => expect(databaseService.getWorkoutLogsForUser).toHaveBeenCalled());

    fireEvent.click(screen.getAllByTitle('Mark complete')[0]);

    // Well inside the 1.2s debounce window.
    await waitFor(() => expect(databaseService.saveWorkoutDraft).toHaveBeenCalled(), { timeout: 400 });
    const saved = databaseService.saveWorkoutDraft.mock.calls[0][0];
    expect(saved).toMatchObject({ userId: CLIENT.id, source: 'coach' });
    expect(saved.exercises[0].sets[0].isCompleted).toBe(true);
    // ...and the rest it started is remembered for this client.
    expect(JSON.parse(localStorage.getItem('coachLiveRestEndAt'))).toMatchObject({ clientId: CLIENT.id });
  });

  it('picks a running rest back up when the resumed Live Log is reopened after a reload', async () => {
    localStorage.setItem('coachLiveRestEndAt', JSON.stringify({ clientId: CLIENT.id, endAt: Date.now() + 45000 }));
    databaseService.getWorkoutDraft.mockResolvedValue({
      userId: CLIENT.id,
      coachId: 'coach1',
      source: 'coach',
      planName: 'Push Day',
      logDate: null,
      exercises: [{ name: 'Bench Press', sets: [{ reps: '8', weight: '40', isCompleted: true, completedAt: Date.now() - 10000 }] }],
      timerStatus: 'running',
      timerStartedAt: Date.now() - 60000,
      pauseIntervals: []
    });
    renderLiveLog();
    expect(await screen.findByText('REST TIMER')).toBeTruthy();
  });

  it('does not restore a rest that belonged to a different client', async () => {
    localStorage.setItem('coachLiveRestEndAt', JSON.stringify({ clientId: 'someone-else', endAt: Date.now() + 45000 }));
    databaseService.getWorkoutDraft.mockResolvedValue({
      userId: CLIENT.id, coachId: 'coach1', source: 'coach', planName: 'Push Day', logDate: null,
      exercises: [{ name: 'Bench Press', sets: [{ reps: '8', weight: '40', isCompleted: true, completedAt: Date.now() }] }],
      timerStatus: 'running', timerStartedAt: Date.now() - 60000, pauseIntervals: []
    });
    renderLiveLog();
    expect((await screen.findAllByText('Bench Press')).length).toBeGreaterThan(0);
    expect(screen.queryByText('REST TIMER')).toBeNull();
  });
});
