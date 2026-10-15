// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import OwnerGymDashboard from './OwnerGymDashboard';

const OWNER = 'owner-id';
const T2 = 'trainer-2';

const payload = () => ({
  success: true,
  gym: { id: 'g1', name: 'Test Gym', joinCode: 'GYM-QFAP', status: 'active' },
  trainers: [
    { id: OWNER, name: 'Test Gym Owner', email: 'owner@x.com', isOwner: true, lastLogin: null, clientCount: 1, activeClients7d: 1 },
    { id: T2, name: 'Asha Trainer', email: 'asha@x.com', isOwner: false, lastLogin: null, clientCount: 1, activeClients7d: 0 }
  ],
  clients: [
    { id: 'c1', name: 'Ravi', email: 'ravi@x.com', coachId: OWNER, trainerName: 'Test Gym Owner', lastWorkout: null, workouts7d: 2, workouts30d: 5 },
    { id: 'c2', name: 'Meena', email: 'meena@x.com', coachId: T2, trainerName: 'Asha Trainer', lastWorkout: null, workouts7d: 0, workouts30d: 0 },
    { id: 'c3', name: 'Kiran', email: 'kiran@x.com', coachId: null, trainerName: null, lastWorkout: null, workouts7d: 0, workouts30d: 0 }
  ]
});

const makeService = (result = payload()) => ({
  getOwnerGym: vi.fn(async () => result),
  ownerAssignClient: vi.fn(async () => ({ success: true, changed: true }))
});

describe('OwnerGymDashboard', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('shows the gym, its code and the headline numbers', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    expect(await screen.findByText('Test Gym')).toBeTruthy();
    expect(screen.getByText('GYM-QFAP')).toBeTruthy();
    expect(screen.getByText('Trainers (2)')).toBeTruthy();
    expect(screen.getByText('Clients (3)')).toBeTruthy();
    expect(screen.getByText('Active this week').previousSibling.textContent).toBe('1');
  });

  it('lists trainers with client counts and marks the owner', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    expect(await screen.findByText('Asha Trainer')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('👥 1 client · 0 active this week')).toBeTruthy();
  });

  it("tapping a trainer shows that trainer's clients", async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    fireEvent.click(await screen.findByTitle("Show Asha Trainer's clients"));
    expect(screen.getByText('Meena')).toBeTruthy();
    expect(screen.queryByText('Ravi')).toBeNull();
    expect(screen.getByLabelText('Filter by trainer').value).toBe(T2);
  });

  it('moves a client to another trainer and reloads', async () => {
    const service = makeService();
    render(<OwnerGymDashboard service={service} />);
    fireEvent.click(await screen.findByText('Clients (3)'));
    fireEvent.change(screen.getByLabelText('Trainer for Ravi'), { target: { value: T2 } });
    await waitFor(() => expect(service.ownerAssignClient).toHaveBeenCalledWith('c1', T2));
    expect(await screen.findByText('Moved to Asha Trainer')).toBeTruthy();
    expect(service.getOwnerGym).toHaveBeenCalledTimes(2);
  });

  it('offers unassigned clients a trainer and a "No trainer" filter', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    fireEvent.click(await screen.findByText('Clients (3)'));
    const select = screen.getByLabelText('Trainer for Kiran');
    expect(within(select).getByText('— Choose a trainer —')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter by trainer'), { target: { value: '__unassigned__' } });
    expect(screen.getByText('Kiran')).toBeTruthy();
    expect(screen.queryByText('Ravi')).toBeNull();
  });

  it('shows a move error on the row', async () => {
    const service = makeService();
    service.ownerAssignClient.mockResolvedValue({ success: false, error: 'That trainer is not in your gym.' });
    render(<OwnerGymDashboard service={service} />);
    fireEvent.click(await screen.findByText('Clients (3)'));
    fireEvent.change(screen.getByLabelText('Trainer for Ravi'), { target: { value: T2 } });
    expect((await screen.findByRole('alert')).textContent).toBe('That trainer is not in your gym.');
  });

  it('locks reassigning while the gym is suspended', async () => {
    const result = payload();
    result.gym.status = 'suspended';
    render(<OwnerGymDashboard service={makeService(result)} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/suspended/);
    fireEvent.click(screen.getByText('Clients (3)'));
    expect(screen.getByLabelText('Trainer for Ravi').disabled).toBe(true);
  });

  it('an owner who does not coach is left out of trainers and dropdowns', async () => {
    const onChange = vi.fn();
    render(<OwnerGymDashboard service={makeService()} coachingOption={{ on: false, locked: false, onChange }} />);
    expect(await screen.findByText('Trainers (1)')).toBeTruthy();
    expect(screen.queryByText('Test Gym Owner')).toBeNull();
    fireEvent.click(screen.getByText('Clients (3)'));
    const options = within(screen.getByLabelText('Trainer for Meena')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Asha Trainer']);

    fireEvent.click(screen.getByRole('switch', { name: 'Also coach clients' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('a coaching owner is listed, and the switch locks while they have clients', async () => {
    render(<OwnerGymDashboard service={makeService()} coachingOption={{ on: true, locked: true, onChange: () => {} }} />);
    expect(await screen.findByText('Trainers (2)')).toBeTruthy();
    const sw = screen.getByRole('switch', { name: 'Also coach clients' });
    expect(sw.checked).toBe(true);
    expect(sw.disabled).toBe(true);
    expect(screen.getByText('On while you have clients of your own.')).toBeTruthy();
  });

  it('the super-admin view (no coachingOption) has no switch and lists everyone', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    expect(await screen.findByText('Trainers (2)')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('flags clients waiting for a trainer and jumps to them', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    fireEvent.click(await screen.findByText('1 client is waiting for a trainer'));
    expect(screen.getByLabelText('Filter by trainer').value).toBe('__unassigned__');
    expect(screen.getByText('Kiran')).toBeTruthy();
    expect(screen.queryByText('Ravi')).toBeNull();
  });

  it('never shows private notes or photos', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    await screen.findByText('Test Gym');
    fireEvent.click(screen.getByText('Clients (3)'));
    expect(screen.queryByText(/note/i)).toBeNull();
    expect(screen.queryByText(/photo/i)).toBeNull();
  });
});
