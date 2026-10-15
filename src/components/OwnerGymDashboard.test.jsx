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
  ownerAssignClient: vi.fn(async () => ({ success: true, changed: true })),
  ownerUnassignClient: vi.fn(async () => ({ success: true, changed: true }))
});

// The card holding this client's name (name → info column → top row → card).
const cardOf = (name) => screen.getByText(name).parentElement.parentElement.parentElement;
const openClients = async () => fireEvent.click(await screen.findByText('Clients (3)'));

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

  it('shows each client’s status clearly: their trainer, or waiting', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    await openClients();
    expect(within(cardOf('Meena')).getByText('Trainer: Asha Trainer')).toBeTruthy();
    expect(within(cardOf('Ravi')).getByText('Trainer: You')).toBeTruthy();
    expect(within(cardOf('Kiran')).getByText('Waiting for a trainer')).toBeTruthy();
    expect(within(cardOf('Kiran')).getByRole('button', { name: 'Assign trainer' })).toBeTruthy();
    expect(within(cardOf('Meena')).getByRole('button', { name: 'Change trainer' })).toBeTruthy();
  });

  it('nothing moves until the owner confirms a plain-language summary', async () => {
    const service = makeService();
    render(<OwnerGymDashboard service={service} />);
    await openClients();
    fireEvent.click(within(cardOf('Ravi')).getByRole('button', { name: 'Change trainer' }));

    const group = screen.getByRole('radiogroup', { name: 'Trainer for Ravi' });
    // current trainer is marked and can't be picked again
    expect(within(group).getByRole('radio', { name: /Test Gym Owner \(you\)/ }).disabled).toBe(true);
    fireEvent.click(within(group).getByRole('radio', { name: /Asha Trainer/ }));
    expect(service.ownerAssignClient).not.toHaveBeenCalled();
    expect(screen.getByText('Move Ravi from you to Asha Trainer?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(service.ownerAssignClient).toHaveBeenCalledWith('c1', T2));
    expect(await screen.findByText(/Ravi is now with Asha Trainer\. Asha Trainer has been notified\./)).toBeTruthy();
    expect(service.getOwnerGym).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('radiogroup', { name: 'Trainer for Ravi' })).toBeNull(); // panel closed
  });

  it('cancel closes the panel without changing anything', async () => {
    const service = makeService();
    render(<OwnerGymDashboard service={service} />);
    await openClients();
    fireEvent.click(within(cardOf('Meena')).getByRole('button', { name: 'Change trainer' }));
    fireEvent.click(screen.getByRole('radio', { name: /No trainer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(service.ownerUnassignClient).not.toHaveBeenCalled();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('unassigns a client back to the waiting list', async () => {
    const service = makeService();
    render(<OwnerGymDashboard service={service} />);
    await openClients();
    fireEvent.click(within(cardOf('Meena')).getByRole('button', { name: 'Change trainer' }));
    fireEvent.click(screen.getByRole('radio', { name: /No trainer/ }));
    expect(screen.getByText(/Remove Meena from Asha Trainer\? They go back to the waiting list/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove trainer' }));
    await waitFor(() => expect(service.ownerUnassignClient).toHaveBeenCalledWith('c2'));
    expect(await screen.findByText(/Meena is back on the waiting list\./)).toBeTruthy();
  });

  it('a waiting client can be given a trainer; "No trainer" is not offered', async () => {
    const service = makeService();
    render(<OwnerGymDashboard service={service} />);
    await openClients();
    fireEvent.click(within(cardOf('Kiran')).getByRole('button', { name: 'Assign trainer' }));
    expect(screen.queryByRole('radio', { name: /No trainer/ })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Asha Trainer/ }));
    expect(screen.getByText('Give Kiran to Asha Trainer as their trainer?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(service.ownerAssignClient).toHaveBeenCalledWith('c3', T2));
  });

  it('the filter reads in plain words', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    await openClients();
    const options = within(screen.getByLabelText('Filter by trainer')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['All clients', 'Your clients', 'Asha Trainer’s clients', 'Waiting for a trainer (1)']);
    fireEvent.change(screen.getByLabelText('Filter by trainer'), { target: { value: '__unassigned__' } });
    expect(screen.getByText('Kiran')).toBeTruthy();
    expect(screen.queryByText('Ravi')).toBeNull();
  });

  it('shows a move error on the card and keeps the panel open', async () => {
    const service = makeService();
    service.ownerAssignClient.mockResolvedValue({ success: false, error: 'That trainer is not in your gym.' });
    render(<OwnerGymDashboard service={service} />);
    await openClients();
    fireEvent.click(within(cardOf('Ravi')).getByRole('button', { name: 'Change trainer' }));
    fireEvent.click(screen.getByRole('radio', { name: /Asha Trainer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect((await screen.findByRole('alert')).textContent).toBe('✕ That trainer is not in your gym.');
    expect(screen.getByRole('radiogroup', { name: 'Trainer for Ravi' })).toBeTruthy();
  });

  it('locks changes while the gym is suspended', async () => {
    const result = payload();
    result.gym.status = 'suspended';
    render(<OwnerGymDashboard service={makeService(result)} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/suspended/);
    fireEvent.click(screen.getByText('Clients (3)'));
    expect(within(cardOf('Ravi')).getByRole('button', { name: 'Change trainer' }).disabled).toBe(true);
  });

  it('an owner who does not coach is left out of trainers and the trainer list', async () => {
    const onChange = vi.fn();
    render(<OwnerGymDashboard service={makeService()} coachingOption={{ on: false, locked: false, onChange }} />);
    expect(await screen.findByText('Trainers (1)')).toBeTruthy();
    expect(screen.queryByText('Test Gym Owner')).toBeNull();
    fireEvent.click(screen.getByText('Clients (3)'));
    fireEvent.click(within(cardOf('Meena')).getByRole('button', { name: 'Change trainer' }));
    const names = within(screen.getByRole('radiogroup', { name: 'Trainer for Meena' })).getAllByRole('radio').map((o) => o.textContent);
    expect(names.some((n) => n.includes('Test Gym Owner'))).toBe(false);

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
