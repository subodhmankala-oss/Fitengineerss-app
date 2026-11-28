import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../services/databaseService', () => ({
  default: {
    getWelcomeSeen: vi.fn(),
    getNotificationPromptSeen: vi.fn(),
    markWelcomeSeen: vi.fn(),
    markNotificationPromptSeen: vi.fn(),
  },
}));
vi.mock('../utils/pushSubscription', () => ({ subscribeToPush: vi.fn() }));

import db from '../services/databaseService';
import WelcomePopups from './WelcomePopups';

afterEach(cleanup);

const setPermission = (p) => {
  globalThis.Notification = { permission: p, requestPermission: vi.fn().mockResolvedValue('denied') };
  window.Notification = globalThis.Notification;
};

beforeEach(() => {
  vi.clearAllMocks();
  setPermission('default');
});

describe('WelcomePopups', () => {
  it('shows the team welcome, then the notifications pop-up, then nothing', async () => {
    db.getWelcomeSeen.mockResolvedValue(false);
    db.getNotificationPromptSeen.mockResolvedValue(false);
    render(<WelcomePopups userId="u1" userName="Asha Rao" />);

    expect(await screen.findByText('Welcome, Asha')).toBeTruthy();
    expect(screen.getByText(/We’re the Fitengineers team/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Let’s go/ }));
    expect(db.markWelcomeSeen).toHaveBeenCalledWith('u1');

    expect(screen.getByText('Never miss a training day')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Maybe later' }));
    expect(db.markNotificationPromptSeen).toHaveBeenCalledWith('u1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('skips the notifications pop-up when the phone already decided', async () => {
    setPermission('granted');
    db.getWelcomeSeen.mockResolvedValue(false);
    render(<WelcomePopups userId="u1" userName="Asha" />);
    fireEvent.click(await screen.findByRole('button', { name: /Let’s go/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(db.getNotificationPromptSeen).not.toHaveBeenCalled();
  });

  it('shows only the notifications pop-up when the welcome was already seen', async () => {
    db.getWelcomeSeen.mockResolvedValue(true);
    db.getNotificationPromptSeen.mockResolvedValue(false);
    render(<WelcomePopups userId="u1" userName="Asha" />);
    expect(await screen.findByText('Never miss a training day')).toBeTruthy();
    expect(screen.queryByText(/Welcome,/)).toBeNull();
  });
});
