// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const db = vi.hoisted(() => ({
  getUserProfileByEmail: vi.fn(),
  saveCoachPhone: vi.fn(),
}));
vi.mock('../services/databaseService', () => ({ __esModule: true, default: db }));

import CoachPhoneRequiredPrompt from './CoachPhoneRequiredPrompt';

describe('CoachPhoneRequiredPrompt', () => {
  beforeEach(() => {
    localStorage.setItem('userEmail', 'coach@example.com');
    db.getUserProfileByEmail.mockResolvedValue({ phone: '' });
    db.saveCoachPhone.mockResolvedValue(undefined);
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('blocks until a 10-digit number is entered, then saves and goes away', async () => {
    render(<CoachPhoneRequiredPrompt />);
    const cont = await screen.findByRole('button', { name: 'Continue' });
    expect(cont.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '98765 43210' } });
    expect(cont.disabled).toBe(false);
    fireEvent.click(cont);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(db.saveCoachPhone).toHaveBeenCalledWith('9876543210');
  });

  it('does not show when the coach already has a phone', async () => {
    db.getUserProfileByEmail.mockResolvedValue({ phone: '+919876543210' });
    render(<CoachPhoneRequiredPrompt />);
    await waitFor(() => expect(db.getUserProfileByEmail).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not show when the profile lookup fails', async () => {
    db.getUserProfileByEmail.mockRejectedValue(new Error('offline'));
    render(<CoachPhoneRequiredPrompt />);
    await waitFor(() => expect(db.getUserProfileByEmail).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
