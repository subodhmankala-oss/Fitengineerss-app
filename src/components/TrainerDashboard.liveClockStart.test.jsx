// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// Same isolated data layer as TrainerDashboard.liveLogOneTap.test.jsx.
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

// TrainerDashboard's first render can take several seconds on a busy runner.
const SLOW = { timeout: 15000 };
const IDLE_HINT = '⏱ Timer starts when you log your first set';

const PLAN = { id: 'p1', planName: 'Leg Day', exercises: [{ name: 'Squat', sets: [{ reps: 10, weight: 20 }, { reps: 10, weight: 20 }] }] };

describe('Coach Live Log workout clock', { timeout: 30000 }, () => {
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

  it('starts when a plan is loaded, not at the first ticked set', async () => {
    renderLiveLog();
    expect(await screen.findByText(IDLE_HINT, {}, SLOW)).toBeTruthy();

    const planSelect = (await screen.findByText('Load from Existing Plan:', {}, SLOW)).parentElement.querySelector('select');
    fireEvent.change(planSelect, { target: { value: PLAN.id } });

    await waitFor(() => expect(screen.queryByText(IDLE_HINT)).toBeNull());
    // The running clock makes it a session worth saving as a draft, so it
    // survives the phone reloading the page before the first tick.
    await waitFor(() => expect(databaseService.saveWorkoutDraft).toHaveBeenCalled(), { timeout: 3000 });
    const saved = databaseService.saveWorkoutDraft.mock.calls.at(-1)[0];
    expect(saved.timerStatus).toBe('running');
    expect(typeof saved.timerStartedAt).toBe('number');
    expect(saved.exercises.map(ex => ex.name)).toEqual(['Squat']);
  });
});
