// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// Same isolated data layer as TrainerDashboard.liveClockStart.test.jsx.
const CLIENT = { id: 'c1', userName: 'Asha', email: 'asha@example.com', role: 'client' };
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
import { getWorkoutLeftovers, updateWorkoutLeftovers } from '../utils/workoutLeftovers';

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

describe('Coach Live Log: not-started exercises move to the next session', { timeout: 30000 }, () => {
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

  it('saving with the tick box on queues them for this client', async () => {
    renderLiveLog();
    await loadPlan();
    expect(screen.queryByText(/Saving now instead\?/)).toBeNull(); // nothing done yet

    fireEvent.click(screen.getAllByTitle('Mark complete')[0]); // one Squat set
    const note = await screen.findByText(/Saving now instead\?/);
    expect(note.closest('label').textContent).toContain('Add Leg Curl, Calf Raise to Asha');

    fireEvent.click(screen.getByText('💾 Save Workout Session'));
    await waitFor(() => expect(databaseService.saveWorkoutSession).toHaveBeenCalled());
    await waitFor(() => expect(getWorkoutLeftovers(CLIENT.id).map(it => it.name)).toEqual(['Leg Curl', 'Calf Raise']));
    expect(getWorkoutLeftovers(CLIENT.id)[0].planName).toBe('Leg Day');
  });

  it('unticking the box saves without queueing anything', async () => {
    renderLiveLog();
    await loadPlan();
    fireEvent.click(screen.getAllByTitle('Mark complete')[0]);
    const box = (await screen.findByText(/Saving now instead\?/)).closest('label').querySelector('input');
    fireEvent.click(box);
    fireEvent.click(screen.getByText('💾 Save Workout Session'));
    await waitFor(() => expect(databaseService.saveWorkoutSession).toHaveBeenCalled());
    expect(getWorkoutLeftovers(CLIENT.id)).toEqual([]);
  });

  it("the client's next session offers them on a card", async () => {
    updateWorkoutLeftovers(CLIENT.id, { skipped: ['Leg Curl', 'Face Pull'], date: '2026-10-12' });
    renderLiveLog();
    await loadPlan();

    // Leg Curl is already in today's plan → only Face Pull is offered.
    const card = await screen.findByTestId('leftover-card', {}, SLOW);
    expect(Array.from(card.querySelectorAll('li')).map(li => li.textContent)).toEqual(['Face Pull']);

    fireEvent.click(screen.getByText('+ Add it'));
    await waitFor(() => expect(screen.queryByTestId('leftover-card')).toBeNull());
    expect(screen.getAllByText('Face Pull').length).toBeGreaterThan(0);
    expect(getWorkoutLeftovers(CLIENT.id).map(it => it.name)).toEqual(['Leg Curl']);
  });
});
