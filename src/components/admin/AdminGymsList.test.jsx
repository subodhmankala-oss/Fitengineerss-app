// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import AdminGymsList from './AdminGymsList';

const gym = (overrides) => ({
  id: 'g1',
  name: 'Iron Den',
  join_code: 'GYM-7KQ2',
  status: 'active',
  created_at: '2026-10-01T10:00:00Z',
  owner: { id: 'o1', email: 'owner@example.com', full_name: 'Ravi Kumar' },
  coaches: 3,
  clients: 12,
  ...overrides
});

const makeService = (gyms) => ({
  getAdminGyms: vi.fn(async () => ({ success: true, gyms })),
  createGym: vi.fn(async () => ({ success: true, gym: {} })),
  updateGym: vi.fn(async () => ({ success: true, gym: {} }))
});

describe('AdminGymsList', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists gyms with owner, code, member counts and status', async () => {
    const service = makeService([gym(), gym({ id: 'g2', name: 'Pulse Fitness', status: 'suspended', owner: null, join_code: 'GYM-AB34', coaches: 1, clients: 0 })]);
    render(<AdminGymsList service={service} />);

    expect(await screen.findByText('Gyms (2)')).toBeTruthy();
    expect(screen.getByText('· 1 suspended')).toBeTruthy();
    expect(screen.getByText(/Ravi Kumar · owner@example.com/)).toBeTruthy();
    expect(screen.getByText('GYM-7KQ2')).toBeTruthy();
    expect(screen.getByText('🏅 3 trainers')).toBeTruthy();
    expect(screen.getByText('🏅 1 trainer')).toBeTruthy();
    expect(screen.getByText('👥 12 clients')).toBeTruthy();
    expect(screen.getByText(/No owner yet/)).toBeTruthy();
    expect(screen.getByText('Reactivate')).toBeTruthy();
    expect(screen.getByText('Suspend')).toBeTruthy();
  });

  it('has no approval step anywhere', async () => {
    const service = makeService([gym()]);
    render(<AdminGymsList service={service} />);
    await screen.findByText('Gyms (1)');
    expect(screen.queryByText(/approv/i)).toBeNull();
    expect(screen.queryByText(/pending/i)).toBeNull();
  });

  it('creates a gym and reloads', async () => {
    const service = makeService([]);
    render(<AdminGymsList service={service} />);
    await screen.findByText('No Gyms Yet');

    fireEvent.change(screen.getByLabelText('Gym name'), { target: { value: 'Iron Den' } });
    fireEvent.change(screen.getByLabelText('Owner email'), { target: { value: 'owner@example.com' } });
    fireEvent.click(screen.getByText('+ Create gym'));

    await waitFor(() => expect(service.createGym).toHaveBeenCalledWith({ name: 'Iron Den', ownerEmail: 'owner@example.com' }));
    await waitFor(() => expect(service.getAdminGyms).toHaveBeenCalledTimes(2));
  });

  it('shows the server error when create fails', async () => {
    const service = makeService([]);
    service.createGym.mockResolvedValue({ success: false, error: 'No account with that email. Ask the owner to sign up first.' });
    render(<AdminGymsList service={service} />);
    await screen.findByText('No Gyms Yet');

    fireEvent.change(screen.getByLabelText('Gym name'), { target: { value: 'Iron Den' } });
    fireEvent.click(screen.getByText('+ Create gym'));
    expect(await screen.findByText('No account with that email. Ask the owner to sign up first.')).toBeTruthy();
  });

  it('reactivates a suspended gym without confirmation', async () => {
    const service = makeService([gym({ status: 'suspended' })]);
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<AdminGymsList service={service} />);
    fireEvent.click(await screen.findByText('Reactivate'));
    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(service.updateGym).toHaveBeenCalledWith('g1', { status: 'active' }));
  });

  it('asks before suspending, and does nothing if cancelled', async () => {
    const service = makeService([gym()]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<AdminGymsList service={service} />);
    fireEvent.click(await screen.findByText('Suspend'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(service.updateGym).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByText('Suspend'));
    await waitFor(() => expect(service.updateGym).toHaveBeenCalledWith('g1', { status: 'suspended' }));
  });

  it('changes the owner inline and shows a row error on failure', async () => {
    const service = makeService([gym()]);
    service.updateGym.mockResolvedValue({ success: false, error: 'No account with that email. Ask the owner to sign up first.' });
    render(<AdminGymsList service={service} />);
    fireEvent.click(await screen.findByText('change'));

    const input = screen.getByLabelText('New owner email for Iron Den');
    expect(input.value).toBe('owner@example.com');
    fireEvent.change(input, { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(service.updateGym).toHaveBeenCalledWith('g1', { ownerEmail: 'new@example.com' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText('New owner email for Iron Den')).toBeTruthy(); // stays open to fix
  });

  it('shows a load error with retry', async () => {
    const service = makeService([]);
    service.getAdminGyms.mockResolvedValueOnce({ success: false, error: 'Could not load gyms.' });
    render(<AdminGymsList service={service} />);
    expect(await screen.findByText(/Could not load gyms\./)).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(service.getAdminGyms).toHaveBeenCalledTimes(2));
  });
});
