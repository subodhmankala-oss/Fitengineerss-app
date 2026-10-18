// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import GymPortal from './GymPortal';

vi.mock('./GymApp', () => ({ default: () => <div>OWNER DASHBOARD</div> }));

const makeService = (over = {}) => ({
  signIn: vi.fn().mockResolvedValue({}),
  signOut: vi.fn().mockResolvedValue(),
  getOwnerGym: vi.fn().mockResolvedValue({ success: true, gym: { id: 'g1', name: 'Test Gym' } }),
  ...over
});

afterEach(cleanup);

describe('GymPortal', () => {
  it('shows the gym login (and no coach/client choices) when signed out', async () => {
    render(<GymPortal service={makeService()} restore={async () => null} />);
    expect(await screen.findByText('Gym owner login')).toBeTruthy();
    expect(screen.queryByText(/sign up/i)).toBeNull();
    expect(screen.queryByText(/client/i)).toBeNull();
  });

  it('goes straight to the dashboard when a saved session owns a gym', async () => {
    render(<GymPortal service={makeService()} restore={async () => ({ user: {} })} />);
    expect(await screen.findByText('OWNER DASHBOARD')).toBeTruthy();
  });

  it('signs in with email and password, then opens the dashboard', async () => {
    const service = makeService();
    render(<GymPortal service={service} restore={async () => null} />);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'owner@x.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(service.signIn).toHaveBeenCalledWith('owner@x.com', 'secret12');
    expect(await screen.findByText('OWNER DASHBOARD')).toBeTruthy();
  });

  it('shows the error and stays on login when the password is wrong', async () => {
    const service = makeService({ signIn: vi.fn().mockRejectedValue(new Error('Invalid login credentials')) });
    render(<GymPortal service={service} restore={async () => null} />);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Invalid login credentials');
    expect(service.getOwnerGym).not.toHaveBeenCalled();
  });

  it('turns away a valid login that owns no gym and lets them sign out', async () => {
    const service = makeService({ getOwnerGym: vi.fn().mockResolvedValue({ success: true, gym: null }) });
    render(<GymPortal service={service} restore={async () => ({ user: {} })} />);
    expect(await screen.findByText('No gym on this account')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use a different account' }));
    expect(service.signOut).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Gym owner login')).toBeTruthy());
  });
});
