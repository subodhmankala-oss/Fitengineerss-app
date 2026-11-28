// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

// A plan Live Log saved after a session (isAssigned: false) never shows in the
// client's Log Sets → Coach Assigned. The coach's plan list must say so and
// offer a one-tap send, instead of labelling it "Assigned to <client>".
const CLIENT = { id: 'c1', userName: 'Asha Rao', email: 'asha@example.com', role: 'client' };
vi.mock('../utils/pushNotify', () => ({ notifyEvent: vi.fn() }));
vi.mock('../services/databaseService', () => {
  const known = {
    resolveUserId: vi.fn().mockResolvedValue('coach1'),
    getAllUsers: vi.fn(),
    getWorkoutDraft: vi.fn(),
    getWorkoutLogsForUser: vi.fn(),
    getWorkoutPlansForUser: vi.fn(),
    saveWorkoutPlan: vi.fn(),
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

const SLOW = { timeout: 15000 };
const set = { reps: 10, weight: 20 };
const SENT = { id: 'p1', planName: 'Push Day', createdBy: 'coach', isAssigned: true, exercises: [{ name: 'Bench Press', sets: [set] }] };
const LIVE = { id: 'p2', planName: 'Leg Day', createdBy: 'coach', isAssigned: false, exercises: [{ name: 'Squat', sets: [set] }] };

describe('Coach plan list: Live Log plans not yet on the client app', { timeout: 30000 }, () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userId', 'coach1');
    localStorage.setItem('userRole', 'coach');
    localStorage.setItem('coachTourSeen', 'true');
    vi.clearAllMocks();
    databaseService.getAllUsers.mockResolvedValue([CLIENT]);
    databaseService.getWorkoutDraft.mockResolvedValue(null);
    databaseService.getWorkoutLogsForUser.mockResolvedValue([]);
    databaseService.getWorkoutPlansForUser.mockResolvedValue([SENT, LIVE]);
    databaseService.saveWorkoutPlan.mockImplementation(async p => ({ ...p }));
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('labels the Live Log plan and sends it to the client in one tap', async () => {
    render(
      <CoachTourProvider>
        <TrainerDashboard handleLogout={() => {}} deepLinkClient={{ id: CLIENT.id, tab: 'plans', nonce: 1 }} />
      </CoachTourProvider>
    );
    expect(await screen.findByText(/not on client's app/i, {}, SLOW)).toBeTruthy();
    expect(screen.getAllByTestId('plan-not-sent')).toHaveLength(1);

    fireEvent.click(screen.getByText('Send to Asha'));

    await waitFor(() => expect(databaseService.saveWorkoutPlan).toHaveBeenCalled());
    expect(databaseService.saveWorkoutPlan.mock.calls[0][0]).toMatchObject({ id: 'p2', userId: 'c1', isAssigned: true, createdBy: 'coach' });
    expect(notifyEvent).toHaveBeenCalledWith('plan_assigned', { clientUserId: 'c1', planName: 'Leg Day' });
    await waitFor(() => expect(screen.queryByTestId('plan-not-sent')).toBeNull());
    expect(screen.queryByText('Send to Asha')).toBeNull();
  });
});
