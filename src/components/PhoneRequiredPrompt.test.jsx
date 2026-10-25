// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const db = vi.hoisted(() => ({
  getUserProfileByEmail: vi.fn(),
  saveOwnPhone: vi.fn(),
}));
vi.mock('../services/databaseService', () => ({ __esModule: true, default: db }));

import PhoneRequiredPrompt from './PhoneRequiredPrompt';

describe('PhoneRequiredPrompt', () => {
  beforeEach(() => {
    localStorage.setItem('userEmail', 'coach@example.com');
    db.getUserProfileByEmail.mockResolvedValue({ phone: '' });
    db.saveOwnPhone.mockImplementation(async phone => { localStorage.setItem('userPhone', phone); });
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('blocks until a 10-digit number is entered, then saves it with +91 and goes away', async () => {
    render(<PhoneRequiredPrompt role="coach" />);
    const cont = await screen.findByRole('button', { name: 'Continue' });
    expect(cont.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull();

    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '98765 4321x09' } });
    expect(screen.getByLabelText('Mobile number').value).toBe('9876543210');
    fireEvent.click(cont);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(db.saveOwnPhone).toHaveBeenCalledWith('+919876543210', 'coach');
  });

  it('shows the error and offers Skip only after a failed save', async () => {
    db.saveOwnPhone.mockRejectedValue(new Error('Could not find your profile — please try again.'));
    render(<PhoneRequiredPrompt role="client" />);
    fireEvent.change(await screen.findByLabelText('Mobile number'), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Could not find your profile/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never shows when a phone is already known (local or on the server)', async () => {
    localStorage.setItem('userPhone', '+919000000000');
    const { unmount } = render(<PhoneRequiredPrompt role="client" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(db.getUserProfileByEmail).not.toHaveBeenCalled();
    unmount();

    localStorage.removeItem('userPhone');
    db.getUserProfileByEmail.mockResolvedValue({ phone: '+919111111111' });
    render(<PhoneRequiredPrompt role="client" />);
    await waitFor(() => expect(localStorage.getItem('userPhone')).toBe('+919111111111'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("doesn't show when the profile can't be read", async () => {
    db.getUserProfileByEmail.mockRejectedValue(new Error('offline'));
    render(<PhoneRequiredPrompt role="coach" />);
    await waitFor(() => expect(db.getUserProfileByEmail).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
