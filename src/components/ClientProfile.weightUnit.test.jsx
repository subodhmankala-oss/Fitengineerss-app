// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/databaseService', () => {
  const svc = {
    getUserProfileByEmail: vi.fn().mockResolvedValue(null),
    resolveUserId: vi.fn().mockResolvedValue(null),
    getBodyMeasurements: vi.fn().mockResolvedValue([]),
    saveUserProfile: vi.fn().mockResolvedValue(undefined)
  };
  return { __esModule: true, default: svc };
});
vi.mock('../utils/pushSubscription', () => ({
  subscribeToPush: vi.fn(), unsubscribeFromPush: vi.fn(), hasActivePushSubscription: vi.fn().mockResolvedValue(false)
}));
vi.mock('../utils/pushNotify', () => ({ notifyEvent: vi.fn() }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ preference: 'system', setTheme: vi.fn() }) }));

import ClientProfile from './ClientProfile';
import databaseService from '../services/databaseService';

const weightInput = () => screen.getByPlaceholderText(/^(kg|lbs)$/);

describe('ClientProfile weight field with the Pounds unit', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userWeight', '81.65');
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows the stored kg weight converted to pounds', () => {
    localStorage.setItem('weightUnit', 'lbs');
    render(<ClientProfile handleLogout={() => {}} initialSection="profile" />);
    expect(weightInput().value).toBe('180');
  });

  it('saves a pounds entry as kilograms', async () => {
    localStorage.setItem('weightUnit', 'lbs');
    render(<ClientProfile handleLogout={() => {}} initialSection="profile" />);
    fireEvent.change(weightInput(), { target: { value: '200' } });
    expect(weightInput().value).toBe('200');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(databaseService.saveUserProfile).toHaveBeenCalled());
    expect(databaseService.saveUserProfile.mock.calls[0][0].userWeight).toBe('90.72');
    expect(localStorage.getItem('userWeight')).toBe('90.72');
  });

  it('keeps kilograms exactly as typed', async () => {
    render(<ClientProfile handleLogout={() => {}} initialSection="profile" />);
    expect(weightInput().value).toBe('81.65');
    fireEvent.change(weightInput(), { target: { value: '72.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(databaseService.saveUserProfile).toHaveBeenCalled());
    expect(databaseService.saveUserProfile.mock.calls[0][0].userWeight).toBe('72.5');
  });
});
