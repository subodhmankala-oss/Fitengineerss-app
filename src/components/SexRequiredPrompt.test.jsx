// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const db = vi.hoisted(() => ({
  getUserProfileByEmail: vi.fn(),
  saveClientSex: vi.fn(),
}));
vi.mock('../services/databaseService', () => ({ __esModule: true, default: db }));

import SexRequiredPrompt from './SexRequiredPrompt';

describe('SexRequiredPrompt', () => {
  beforeEach(() => {
    localStorage.setItem('userEmail', 'asha@example.com');
    db.getUserProfileByEmail.mockResolvedValue({ userSex: '' });
    db.saveClientSex.mockImplementation(async sex => { localStorage.setItem('userSex', sex); });
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('blocks until a sex is picked, then saves it and goes away', async () => {
    render(<SexRequiredPrompt />);
    const cont = await screen.findByRole('button', { name: 'Continue' });
    expect(cont.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Female' }));
    expect(cont.disabled).toBe(false);
    fireEvent.click(cont);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(db.saveClientSex).toHaveBeenCalledWith('female');
    expect(localStorage.getItem('userSex')).toBe('female');
  });

  it('stays up and shows the error when saving fails', async () => {
    db.saveClientSex.mockRejectedValue(new Error('Network down'));
    render(<SexRequiredPrompt />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Male' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Network down')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('never shows when the profile already has a sex (local or on the server)', async () => {
    localStorage.setItem('userSex', 'male');
    const { unmount } = render(<SexRequiredPrompt />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(db.getUserProfileByEmail).not.toHaveBeenCalled();
    unmount();

    localStorage.removeItem('userSex');
    db.getUserProfileByEmail.mockResolvedValue({ userSex: 'female' });
    render(<SexRequiredPrompt />);
    await waitFor(() => expect(localStorage.getItem('userSex')).toBe('female'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
