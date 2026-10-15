// @vitest-environment jsdom
// Gym owners land on My Gym; the My Clients tab only exists for an owner who
// has clients of their own or switched on "Also coach clients". Regular
// coaches see no change.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/databaseService', () => {
  const known = {
    resolveUserId: vi.fn().mockResolvedValue('coach1'),
    getAllUsers: vi.fn(),
    getOwnerGym: vi.fn(),
    getCoachGym: vi.fn(),
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
import { ThemeContext } from '../context/useTheme';

const SLOW = { timeout: 15000 };
const GYM = {
  success: true,
  gym: { id: 'g1', name: 'Test Gym', joinCode: 'GYM-QFAP', status: 'active' },
  trainers: [{ id: 'coach1', name: 'Owner', email: 'owner@x.com', isOwner: true, clientCount: 0, activeClients7d: 0 }],
  clients: []
};
const OWN_CLIENT = { id: 'c1', userName: 'Asha', email: 'asha@example.com', role: 'client', coach_id: 'coach1' };

const renderDashboard = () => render(
  <ThemeContext.Provider value={{ preference: 'light', setTheme: () => {} }}>
    <CoachTourProvider>
      <TrainerDashboard handleLogout={() => {}} />
    </CoachTourProvider>
  </ThemeContext.Provider>
);
const NO_GYM_MEMBERSHIP = { success: true, gym: null, clientsOutsideGym: 0 };
const TRAINER_IN_GYM = { success: true, gym: { name: 'Test Gym', status: 'active', code: 'GYM-QFAP', isOwner: false }, clientsOutsideGym: 0 };

const myClientsTab = () => screen.queryByRole('button', { name: /My Clients/ });

describe('TrainerDashboard — gym owner view', { timeout: 30000 }, () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userId', 'coach1');
    localStorage.setItem('userEmail', 'owner@x.com');
    localStorage.setItem('userRole', 'coach');
    localStorage.setItem('coachTourSeen', 'true');
    vi.clearAllMocks();
    databaseService.getAllUsers.mockResolvedValue([]);
    databaseService.getOwnerGym.mockResolvedValue(GYM);
    databaseService.getCoachGym.mockResolvedValue(NO_GYM_MEMBERSHIP);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('an owner who does not coach lands on My Gym with no My Clients tab', async () => {
    renderDashboard();
    expect(await screen.findByText('GYM-QFAP', {}, SLOW)).toBeTruthy();
    expect(myClientsTab()).toBeNull();
    expect(screen.queryByText('Invite Clients')).toBeNull();
    // remembered, so the next load skips the coach screen entirely
    expect(localStorage.getItem('ownsGym:owner@x.com')).toBe('true');
  });

  it('"Also coach clients" adds the My Clients tab and opens it', async () => {
    renderDashboard();
    fireEvent.click(await screen.findByRole('switch', { name: 'Also coach clients' }, SLOW));
    await waitFor(() => expect(myClientsTab()).toBeTruthy());
    expect(await screen.findByText('Invite Clients')).toBeTruthy();
    expect(localStorage.getItem('ownerCoachesClients')).toBe('true');
  });

  it('an owner with clients of their own gets the tab but still lands on My Gym', async () => {
    databaseService.getAllUsers.mockResolvedValue([OWN_CLIENT]);
    renderDashboard();
    expect(await screen.findByText('GYM-QFAP', {}, SLOW)).toBeTruthy();
    await waitFor(() => expect(myClientsTab()).toBeTruthy());
  });

  it('a regular coach (no gym) sees the usual dashboard and no My Gym', async () => {
    databaseService.getOwnerGym.mockResolvedValue({ success: true, gym: null, trainers: [], clients: [] });
    renderDashboard();
    expect(await screen.findByText('Invite Clients', {}, SLOW)).toBeTruthy();
    await waitFor(() => expect(databaseService.getOwnerGym).toHaveBeenCalled());
    expect(screen.queryByText(/My Gym/)).toBeNull();
  });

  it('a stale "owns a gym" flag is corrected when the server says otherwise', async () => {
    localStorage.setItem('ownsGym:owner@x.com', 'true');
    databaseService.getOwnerGym.mockResolvedValue({ success: true, gym: null, trainers: [], clients: [] });
    renderDashboard();
    expect(await screen.findByText('Invite Clients', {}, SLOW)).toBeTruthy();
    expect(localStorage.getItem('ownsGym:owner@x.com')).toBeNull();
  });

  it('a trainer in a gym sees a gym chip that opens their My Gym page', async () => {
    databaseService.getOwnerGym.mockResolvedValue({ success: true, gym: null, trainers: [], clients: [] });
    databaseService.getCoachGym.mockResolvedValue(TRAINER_IN_GYM);
    renderDashboard();
    const chip = await screen.findByRole('button', { name: 'Your gym: Test Gym' }, SLOW);
    expect(chip.textContent).toBe('🏢 Test Gym');
    fireEvent.click(chip);
    expect(await screen.findByText('My Gym')).toBeTruthy(); // profile sub-page title
    expect(await screen.findByText(/never your private notes or photos/)).toBeTruthy();
  });

  it('a coach in no gym gets no chip', async () => {
    databaseService.getOwnerGym.mockResolvedValue({ success: true, gym: null, trainers: [], clients: [] });
    renderDashboard();
    expect(await screen.findByText('Invite Clients', {}, SLOW)).toBeTruthy();
    await waitFor(() => expect(databaseService.getCoachGym).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Your gym:/ })).toBeNull();
  });
});
