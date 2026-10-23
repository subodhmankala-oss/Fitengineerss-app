import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import CoachNotificationBell from './CoachNotificationBell';

const now = new Date().toISOString();

describe('CoachNotificationBell', () => {
  afterEach(cleanup);

  it('shows the unread count and an empty state', () => {
    const { rerender } = render(<CoachNotificationBell items={[]} />);
    expect(screen.queryByText('1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByText("You're all caught up.")).toBeTruthy();

    rerender(<CoachNotificationBell items={[{ key: 'a', title: 'Asha replied', at: now }]} />);
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('opens the item and closes the panel', () => {
    const open = vi.fn();
    render(<CoachNotificationBell items={[{ key: 'a', title: 'Ravi updated measurements', at: now, open }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 new' }));
    fireEvent.click(screen.getByText('Ravi updated measurements'));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sends from the inline composer, with a suggestion chip', async () => {
    const send = vi.fn().mockResolvedValue(true);
    render(<CoachNotificationBell items={[{
      key: 's', title: 'Asha finished Push Day', at: now,
      compose: { label: 'Send note', suggestions: ['Great session!'], send }
    }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 new' }));
    fireEvent.click(screen.getByText('Send note'));
    fireEvent.click(screen.getByText('Great session!'));
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('Great session!'));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });

  it('runs actions, dismiss and clear all', () => {
    const run = vi.fn();
    const dismiss = vi.fn();
    const onClearAll = vi.fn();
    render(<CoachNotificationBell
      onClearAll={onClearAll}
      items={[
        { key: 'r', title: 'Renewal overdue', actions: [{ label: 'Gentle reminder', run }], dismiss },
        { key: 'n', title: 'New client' }
      ]}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 2 new' }));
    fireEvent.click(screen.getByText('Gentle reminder'));
    expect(run).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(dismiss).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Clear all'));
    expect(onClearAll).toHaveBeenCalled();
  });
});
