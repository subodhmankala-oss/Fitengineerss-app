import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('../services/databaseService', () => ({
  default: {
    getUserProfileByEmail: vi.fn(),
    saveClientPhone: vi.fn(),
    saveCoachPhone: vi.fn(),
  },
}));

import databaseService from '../services/databaseService';
import PhoneGate from './PhoneGate';

describe('PhoneGate', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userEmail', 'someone@example.com');
    localStorage.setItem('userId', 'user-1');
    Object.values(databaseService).forEach(fn => fn.mockReset());
  });
  afterEach(cleanup);

  it('asks a client with no number, and saves it on their client row', async () => {
    databaseService.getUserProfileByEmail.mockResolvedValue({ phone: '' });
    databaseService.saveClientPhone.mockResolvedValue();
    render(<PhoneGate role="client" />);

    expect(await screen.findByText('Add your phone number')).toBeTruthy();
    expect(screen.getByText(/Your coach uses it to reach you on WhatsApp/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('10-digit mobile number'), { target: { value: '12345' } });
    fireEvent.click(screen.getByText('Save and continue'));
    expect(await screen.findByText(/valid 10-digit Indian mobile/)).toBeTruthy();
    expect(databaseService.saveClientPhone).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('10-digit mobile number'), { target: { value: '98123 45670' } });
    fireEvent.click(screen.getByText('Save and continue'));
    await waitFor(() => expect(databaseService.saveClientPhone).toHaveBeenCalledWith('user-1', '+919812345670'));
    expect(databaseService.saveCoachPhone).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Add your phone number')).toBeNull());
  });

  it('stays hidden for a client whose number is on file', async () => {
    databaseService.getUserProfileByEmail.mockResolvedValue({ phone: '+919812345670' });
    render(<PhoneGate role="client" />);
    await waitFor(() => expect(localStorage.getItem('userPhone')).toBe('+919812345670'));
    expect(screen.queryByText('Add your phone number')).toBeNull();
  });

  it('never locks anyone out when the profile read fails', async () => {
    databaseService.getUserProfileByEmail.mockRejectedValue(new Error('offline'));
    render(<PhoneGate role="client" />);
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByText('Add your phone number')).toBeNull();
  });

  it('still saves a coach number the coach way', async () => {
    databaseService.getUserProfileByEmail.mockResolvedValue({ phone: null });
    databaseService.saveCoachPhone.mockResolvedValue();
    render(<PhoneGate />);
    expect(await screen.findByText(/required for every coach account/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('10-digit mobile number'), { target: { value: '9812345670' } });
    fireEvent.click(screen.getByText('Save and continue'));
    await waitFor(() => expect(databaseService.saveCoachPhone).toHaveBeenCalledWith('user-1', '+919812345670'));
  });
});
