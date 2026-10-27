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

  it('opens the item and closes the panel', async () => {
    const open = vi.fn();
    render(<CoachNotificationBell items={[{ key: 'a', title: 'Ravi updated measurements', at: now, open }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 new' }));
    fireEvent.click(screen.getByText('Ravi updated measurements'));
    expect(open).toHaveBeenCalledTimes(1);
    // Closing plays a short animation before the panel unmounts.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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

  it('one-tap reminder leads, sends and confirms in the panel', () => {
    const run = vi.fn();
    render(<CoachNotificationBell items={[{
      key: 'm', title: 'Measurement Check-in Needed', at: now,
      actions: [{ label: 'Send reminder', flash: 'Measurement reminder sent to Ravi', run }],
      compose: { label: 'Send note', send: vi.fn() },
      open: vi.fn()
    }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 new' }));
    const buttons = screen.getAllByRole('button').map(b => b.textContent);
    expect(buttons.indexOf('Send reminder')).toBeLessThan(buttons.indexOf('Send note'));
    expect(screen.getByText('Send reminder').className).toContain('cnb-btn-primary');
    fireEvent.click(screen.getByText('Send reminder'));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('Measurement reminder sent to Ravi');
  });

  it('an action that goes somewhere else closes the panel', async () => {
    const run = vi.fn();
    render(<CoachNotificationBell items={[{
      key: 'r', title: "Vaishali's renewal is due in 1 day",
      actions: [{ label: 'Gentle reminder', run: vi.fn() }, { label: 'Log payment', closes: true, run }]
    }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 new' }));
    fireEvent.click(screen.getByText('Gentle reminder'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByText('Log payment'));
    expect(run).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the composer open and says so when a note fails', async () => {
    const send = vi.fn().mockResolvedValue(false);
    render(<CoachNotificationBell items={[{ key: 'q', title: 'Ravi has gone quiet', compose: { label: 'Send note', send } }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 new' }));
    fireEvent.click(screen.getByText('Send note'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Everything okay?' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe("Couldn't send — try again"));
    expect(screen.getByRole('textbox').value).toBe('Everything okay?');
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
