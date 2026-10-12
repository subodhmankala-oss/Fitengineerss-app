// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// Coach has to leave mid Live Log: hand the session over to the client.
// Same isolated data layer as TrainerDashboard.leftovers.test.jsx.
const CLIENT = { id: 'c1', userName: 'Asha', email: 'asha@example.com', role: 'client' };
vi.mock('../utils/pushNotify', () => ({ notifyEvent: vi.fn() }));
vi.mock('../services/databaseService', () => {
  const known = {
    resolveUserId: vi.fn().mockResolvedValue('coach1'),
    getAllUsers: vi.fn(),
    getWorkoutDraft: vi.fn(),
    getWorkoutLogsForUser: vi.fn(),
    getWorkoutPlansForUser: vi.fn(),
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    deleteWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    saveWorkoutSession: vi.fn().mockResolvedValue(undefined),
    handOverLiveSession: vi.fn(),
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
import { notifyEvent } from '../utils/pushNotify';
import { CoachTourProvider } from '../context/CoachTourContext';

const renderLiveLog = () => render(
  <CoachTourProvider>
    <TrainerDashboard handleLogout={() => {}} deepLinkClient={{ id: CLIENT.id, tab: 'livelog', nonce: 1 }} />
  </CoachTourProvider>
);

// TrainerDashboard's first render can take several seconds on a busy runner.
const SLOW = { timeout: 15000 };

const set = { reps: 10, weight: 20 };
const PLAN = { id: 'p1', planName: 'Leg Day', exercises: [
  { name: 'Squat', sets: [set, set] },
  { name: 'Leg Curl', sets: [set] },
  { name: 'Calf Raise', sets: [set] },
] };

const loadPlan = async () => {
  const planSelect = (await screen.findByText('Load from Existing Plan:', {}, SLOW)).parentElement.querySelector('select');
  fireEvent.change(planSelect, { target: { value: PLAN.id } });
  await waitFor(() => expect(screen.getAllByTitle('Mark complete').length).toBeGreaterThan(0));
};

describe('Coach Live Log: hand over to the client', { timeout: 30000 }, () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userId', 'coach1');
    localStorage.setItem('userRole', 'coach');
    localStorage.setItem('coachTourSeen', 'true');
    vi.clearAllMocks();
    databaseService.getAllUsers.mockResolvedValue([CLIENT]);
    databaseService.getWorkoutDraft.mockResolvedValue(null);
    databaseService.getWorkoutLogsForUser.mockResolvedValue([]);
    databaseService.getWorkoutPlansForUser.mockResolvedValue([PLAN]);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const handOver = async () => {
    fireEvent.click(await screen.findByText('📲 Hand over to Asha'));
    fireEvent.click(screen.getByText('📲 Hand over'));
  };

  it('sends the session with its ticked sets, closes the Live Log and notifies the client', async () => {
    databaseService.handOverLiveSession.mockResolvedValue('ok');
    renderLiveLog();
    await loadPlan();
    expect(screen.queryByText(/Running late/)).toBeNull(); // no set ticked yet

    fireEvent.click(screen.getAllByTitle('Mark complete')[0]);
    await handOver();

    await waitFor(() => expect(databaseService.handOverLiveSession).toHaveBeenCalled());
    const draft = databaseService.handOverLiveSession.mock.calls[0][0];
    expect(draft.userId).toBe(CLIENT.id);
    expect(draft.planName).toBe('Leg Day');
    expect(draft.exercises.map(ex => ex.name)).toEqual(['Squat', 'Leg Curl', 'Calf Raise']);
    expect(draft.exercises[0].sets[0].isCompleted).toBe(true);

    await waitFor(() => expect(databaseService.deleteWorkoutDraft).toHaveBeenCalledWith(CLIENT.id, 'coach'));
    expect(notifyEvent).toHaveBeenCalledWith('session_handed_over', { clientUserId: CLIENT.id, planName: 'Leg Day' });
    await waitFor(() => expect(screen.queryAllByTitle('Mark complete')).toHaveLength(0));
    expect(await screen.findByText(/Handed over to Asha/)).toBeTruthy();
  });

  it("keeps the Live Log when the client already has a workout open", async () => {
    databaseService.handOverLiveSession.mockResolvedValue('client_session_open');
    renderLiveLog();
    await loadPlan();
    fireEvent.click(screen.getAllByTitle('Mark complete')[0]);
    await handOver();

    expect(await screen.findByText(/Asha already has a workout open/)).toBeTruthy();
    expect(databaseService.deleteWorkoutDraft).not.toHaveBeenCalledWith(CLIENT.id, 'coach');
    expect(notifyEvent).not.toHaveBeenCalledWith('session_handed_over', expect.anything());
    expect(screen.getAllByTitle('Mark complete').length).toBeGreaterThan(0);
  });

  it('puts warm-up moves at the top of the handed-over session', async () => {
    databaseService.handOverLiveSession.mockResolvedValue('ok');
    databaseService.getWorkoutPlansForUser.mockResolvedValue([{ id: 'p2', planName: 'Mixed', exercises: [
      { name: 'Squat', sets: [set] },
      { name: 'Arm Circle', sets: [set] },
      { name: 'Leg Curl', sets: [set] },
    ] }]);
    renderLiveLog();
    const planSelect = (await screen.findByText('Load from Existing Plan:', {}, SLOW)).parentElement.querySelector('select');
    fireEvent.change(planSelect, { target: { value: 'p2' } });
    await waitFor(() => expect(screen.getAllByTitle('Mark complete').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTitle('Mark complete')[0]);
    await handOver();

    await waitFor(() => expect(databaseService.handOverLiveSession).toHaveBeenCalled());
    const names = databaseService.handOverLiveSession.mock.calls[0][0].exercises.map(ex => ex.name);
    expect(names).toEqual(['Arm Circle', 'Squat', 'Leg Curl']);
  });
});
