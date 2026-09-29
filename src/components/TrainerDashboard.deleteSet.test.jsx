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

// No jest-dom in this project — plain className check instead of toHaveClass.
const hasClass = (el, cls) => el.className.split(/\s+/).includes(cls);

const threeSetDraft = () => ({
  userId: CLIENT.id,
  coachId: 'coach1',
  source: 'coach',
  planName: 'Push Day',
  logDate: null,
  exercises: [{
    name: 'Bench Press',
    sets: [
      { reps: 10, weight: '40', isCompleted: false },
      { reps: 9, weight: '42.5', isCompleted: false },
      { reps: 8, weight: '45', isCompleted: false }
    ]
  }],
  timerStatus: 'idle',
  timerStartedAt: null,
  pauseIntervals: []
});

describe('Coach Live Log delete set', { timeout: 30000 }, () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userId', 'coach1');
    localStorage.setItem('userRole', 'coach');
    localStorage.setItem('coachTourSeen', 'true');
    vi.clearAllMocks();
    databaseService.getAllUsers.mockResolvedValue([CLIENT]);
    databaseService.getWorkoutDraft.mockResolvedValue(threeSetDraft());
    databaseService.getWorkoutLogsForUser.mockResolvedValue([]);
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('deleting the top set removes only that one — the row that takes its place stays fully visible and clickable', async () => {
    renderLiveLog();
    expect(await screen.findByRole('button', { name: '40' }, SLOW)).toBeTruthy();
    expect(screen.getAllByTitle('Delete Set').length).toBe(3);

    fireEvent.click(screen.getAllByTitle('Delete Set')[0]);

    // jsdom never fires animationend for a real CSS animation, so removal
    // here falls back to useExitingSetRow's safety timer (900ms) — a
    // generous timeout on top of that since a busy full-suite run can delay
    // real setTimeout callbacks well past their nominal delay.
    await waitFor(() => expect(screen.queryByRole('button', { name: '40' })).toBeNull(), { timeout: 5000 });

    expect(screen.getByRole('button', { name: '42.5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '45' })).toBeTruthy();
    expect(screen.getAllByTitle('Delete Set').length).toBe(2);
    // The row that shifted into the top slot isn't stuck wearing the OLD
    // top row's exit styling — see WorkoutTracker.deleteSet.test.jsx for
    // the full "ghost row" explanation.
    const newTopRow = screen.getByRole('button', { name: '42.5' }).closest('.hevy-set-row');
    expect(hasClass(newTopRow, 'set-row-exit')).toBe(false);
  });
});
