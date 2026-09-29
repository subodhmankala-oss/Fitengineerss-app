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

// TrainerDashboard is very large; its first render alone can take several
// seconds on a busy machine or CI runner, well past the 1s findBy default.
const SLOW = { timeout: 15000 };

const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

// No jest-dom in this project — plain className check instead of toHaveClass.
const hasClass = (el, cls) => el.className.split(/\s+/).includes(cls);

const twoSetDraft = (sets) => ({
  userId: CLIENT.id,
  coachId: 'coach1',
  source: 'coach',
  planName: 'Push Day',
  logDate: null,
  exercises: [{ name: 'Bench Press', sets }],
  timerStatus: 'idle',
  timerStartedAt: null,
  pauseIntervals: []
});

describe('Coach Live Log one-tap set logging', { timeout: 30000 }, () => {
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
    expect((await screen.findAllByText('Shoulders Press', {}, SLOW)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '20' }).length).toBe(2);

    logs.resolve([
      { log_date: '2026-09-01', exercise_name: 'Shoulders Press', set_number: 1, reps: 10, weight_kg: 32.5 },
      { log_date: '2026-09-01', exercise_name: 'Shoulders Press', set_number: 2, reps: 8, weight_kg: 35 }
    ]);

    expect(await screen.findByRole('button', { name: '32.5' }, SLOW)).toBeTruthy();
    expect(screen.getByRole('button', { name: '35' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '20' })).toBeNull();
  });

  it('saves the draft right away when a set is ticked, instead of after the debounce', async () => {
    renderLiveLog();
    expect((await screen.findAllByText('Shoulders Press', {}, SLOW)).length).toBeGreaterThan(0);
    await waitFor(() => expect(databaseService.getWorkoutLogsForUser).toHaveBeenCalled());

    fireEvent.click(screen.getAllByTitle('Mark complete')[0]);

    // Inside the 1.2s debounce window.
    await waitFor(() => expect(databaseService.saveWorkoutDraft).toHaveBeenCalled(), { timeout: 1000 });
    const saved = databaseService.saveWorkoutDraft.mock.calls[0][0];
    expect(saved).toMatchObject({ userId: CLIENT.id, source: 'coach' });
    expect(saved.exercises[0].sets[0].isCompleted).toBe(true);
    // The rest timer is manual now — ticking a set doesn't start one.
    expect(localStorage.getItem('coachLiveRestEndAt')).toBeNull();
  });

  it('starts a rest only from the Start Rest button, remembered for this client', async () => {
    renderLiveLog();
    expect((await screen.findAllByText('Shoulders Press', {}, SLOW)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText('⏱️ Start Rest')[0]);

    await waitFor(() => expect(JSON.parse(localStorage.getItem('coachLiveRestEndAt'))).toMatchObject({ clientId: CLIENT.id }));
  });

  it('"✓ all" in the header completes every set of that exercise', async () => {
    renderLiveLog();
    expect((await screen.findAllByText('Shoulders Press', {}, SLOW)).length).toBeGreaterThan(0);
    await waitFor(() => expect(databaseService.getWorkoutLogsForUser).toHaveBeenCalled());
    expect(screen.getAllByTitle('Mark complete').length).toBe(2);

    fireEvent.click(screen.getByTitle('Mark all sets done'));

    await waitFor(() => expect(screen.getAllByTitle('Mark incomplete').length).toBe(2));
    expect(screen.queryByTitle('Mark complete')).toBeNull();
    await waitFor(() => expect(databaseService.saveWorkoutDraft).toHaveBeenCalled(), { timeout: 1000 });
    const saved = databaseService.saveWorkoutDraft.mock.calls.at(-1)[0];
    expect(saved.exercises[0].sets.every(s => s.isCompleted)).toBe(true);
  });

  it("pre-fills an exercise's note from the client's last session with it", async () => {
    databaseService.getWorkoutLogsForUser.mockResolvedValue([
      { log_date: '2026-09-01', exercise_name: 'Shoulders Press', set_number: 1, reps: 10, weight_kg: 20, exercise_notes: 'Seat at 4' }
    ]);
    renderLiveLog();
    expect((await screen.findAllByText('Shoulders Press', {}, SLOW)).length).toBeGreaterThan(0);

    // Collapsed by default, but the summary shows a note is there.
    expect(await screen.findByText('Note', {}, SLOW)).toBeTruthy();
    fireEvent.click(screen.getAllByText('RPE & Notes', { exact: false })[0].closest('button'));
    const notes = screen.getByPlaceholderText(/Notes/);
    expect(notes.value).toBe('Seat at 4');
    expect(hasClass(notes, 'ex-notes-input--from-last')).toBe(true);

    fireEvent.change(notes, { target: { value: 'Seat at 5' } });
    expect(screen.getByPlaceholderText(/Notes/).value).toBe('Seat at 5');
    expect(hasClass(screen.getByPlaceholderText(/Notes/), 'ex-notes-input--from-last')).toBe(false);
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
    expect(await screen.findByText('REST TIMER', {}, SLOW)).toBeTruthy();
    // Only the coach's own Live Log row is resumed, never the client's own session.
    expect(databaseService.getWorkoutDraft).toHaveBeenCalledWith(CLIENT.id, 'coach');
  });

  it('shows PREV-filled values as ghost until confirmed, and advances focus to the next set on tap', async () => {
    databaseService.getWorkoutDraft.mockResolvedValue(twoSetDraft([
      { reps: 9, weight: '42.5', isCompleted: false, weightFromPrev: true, repsFromPrev: true },
      { reps: 7, weight: '45', isCompleted: false, weightFromPrev: true, repsFromPrev: true }
    ]));
    renderLiveLog();
    expect(await screen.findByRole('button', { name: '42.5' }, SLOW)).toBeTruthy();

    const set1Weight = screen.getByRole('button', { name: '42.5' });
    const set2Weight = screen.getByRole('button', { name: '45' });
    expect(hasClass(set1Weight, 'set-value-ghost')).toBe(true);
    expect(hasClass(set2Weight, 'set-value-ghost')).toBe(true);
    expect(hasClass(set2Weight, 'is-active')).toBe(false);

    fireEvent.click(screen.getAllByTitle('Mark complete')[0]);

    // Completing set 1 confirms it (ghost clears) and hands focus to set 2's
    // kg box, which is still an unconfirmed guess.
    await waitFor(() => expect(hasClass(screen.getByRole('button', { name: '42.5' }), 'set-value-ghost')).toBe(false));
    expect(hasClass(screen.getByRole('button', { name: '45' }), 'is-active')).toBe(true);
    expect(hasClass(screen.getByRole('button', { name: '45' }), 'set-value-ghost')).toBe(true);
  });

  it('does not restore a rest that belonged to a different client', async () => {
    localStorage.setItem('coachLiveRestEndAt', JSON.stringify({ clientId: 'someone-else', endAt: Date.now() + 45000 }));
    databaseService.getWorkoutDraft.mockResolvedValue({
      userId: CLIENT.id, coachId: 'coach1', source: 'coach', planName: 'Push Day', logDate: null,
      exercises: [{ name: 'Bench Press', sets: [{ reps: '8', weight: '40', isCompleted: true, completedAt: Date.now() }] }],
      timerStatus: 'running', timerStartedAt: Date.now() - 60000, pauseIntervals: []
    });
    renderLiveLog();
    expect((await screen.findAllByText('Bench Press', {}, SLOW)).length).toBeGreaterThan(0);
    expect(screen.queryByText('REST TIMER')).toBeNull();
  });
});
