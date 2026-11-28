import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../services/databaseService', () => ({
  default: {
    getWelcomeSeen: vi.fn(),
    markWelcomeSeen: vi.fn(),
    markNotificationPromptSeen: vi.fn(),
  },
}));
vi.mock('../utils/pushSubscription', () => ({ subscribeToPush: vi.fn() }));

import db from '../services/databaseService';
import { subscribeToPush } from '../utils/pushSubscription';
import WelcomePopups from './WelcomePopups';
import { enableStepsFor } from '../utils/notifPermission';

afterEach(cleanup);

let permission;
beforeEach(() => {
  vi.clearAllMocks();
  permission = 'default';
  const N = { requestPermission: vi.fn(async () => permission) };
  Object.defineProperty(N, 'permission', { get: () => permission, configurable: true });
  window.Notification = N;
  globalThis.Notification = N;
});

describe('WelcomePopups', () => {
  it('shows the team welcome, then a notifications pop-up with no way to skip', async () => {
    db.getWelcomeSeen.mockResolvedValue(false);
    render(<WelcomePopups userId="u1" userName="Asha Rao" />);

    expect(await screen.findByText('Welcome, Asha')).toBeTruthy();
    expect(screen.getByText(/We’re the Fitengineers team/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Let’s go/ }));
    expect(db.markWelcomeSeen).toHaveBeenCalledWith('u1');

    expect(screen.getByText('Turn on notifications', { selector: 'h3' })).toBeTruthy();
    expect(screen.queryByText(/Maybe later/)).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('closes only once the phone allows notifications, and subscribes', async () => {
    db.getWelcomeSeen.mockResolvedValue(true);
    render(<WelcomePopups userId="u1" userName="Asha" />);
    permission = 'granted';
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Turn on notifications' })); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(subscribeToPush).toHaveBeenCalledWith('Asha');
    expect(db.markNotificationPromptSeen).toHaveBeenCalledWith('u1');
  });

  it('switches to settings steps when the client taps Block, and stays open', async () => {
    db.getWelcomeSeen.mockResolvedValue(true);
    render(<WelcomePopups userId="u1" userName="Asha" />);
    permission = 'denied';
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Turn on notifications' })); });
    expect(screen.getByText('Notifications are blocked')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(screen.getByText(/Still off/)).toBeTruthy();
  });

  it('clears the blocked pop-up when the client comes back with notifications on', async () => {
    permission = 'denied';
    db.getWelcomeSeen.mockResolvedValue(true);
    render(<WelcomePopups userId="u1" userName="Asha" />);
    expect(screen.getByText('Turn on notifications', { selector: 'h3' })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Turn on notifications' })); });
    expect(screen.getByText('Notifications are blocked')).toBeTruthy();
    expect(window.Notification.requestPermission).not.toHaveBeenCalled();
    permission = 'granted';
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(subscribeToPush).toHaveBeenCalled();
  });

  it('shows nothing when notifications are already on and the welcome was seen', async () => {
    permission = 'granted';
    db.getWelcomeSeen.mockResolvedValue(true);
    render(<WelcomePopups userId="u1" userName="Asha" />);
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('skips notifications on a browser that cannot do them', async () => {
    delete window.Notification;
    delete globalThis.Notification;
    db.getWelcomeSeen.mockResolvedValue(false);
    render(<WelcomePopups userId="u1" userName="Asha" />);
    fireEvent.click(await screen.findByRole('button', { name: /Let’s go/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('enableStepsFor', () => {
  it('gives iPhone and Android their own steps', () => {
    expect(enableStepsFor('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')[0]).toMatch(/iPhone Settings/);
    expect(enableStepsFor('Mozilla/5.0 (Linux; Android 14)')[1]).toMatch(/Permissions/);
  });
});
