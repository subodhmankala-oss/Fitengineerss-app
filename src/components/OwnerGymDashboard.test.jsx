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
    { id: OWNER, name: 'Test Gym Owner', email: 'owner@x.com', isOwner: true, lastLogin: null, clientCount: 1, activeClients7d: 1,
      stats: { active14: 1, activePct: 100, perClientWeek: 2.5, atRisk: 0, workouts7d: 2, weekly: [0, 0, 0, 0, 1, 2, 3, 2] } },
    { id: T2, name: 'Asha Trainer', email: 'asha@x.com', isOwner: false, lastLogin: null, clientCount: 1, activeClients7d: 0,
      stats: { active14: 0, activePct: 0, perClientWeek: 0.5, atRisk: 1, workouts7d: 0, weekly: [2, 3, 2, 1, 0, 0, 0, 0] } }
  ],
  clients: [
    { id: 'c1', name: 'Ravi', email: 'ravi@x.com', coachId: OWNER, trainerName: 'Test Gym Owner', lastWorkout: null, workouts7d: 2, workouts30d: 5,
      engagement: { status: 'thriving', recent14: 5, prior28: 8 } },
    { id: 'c2', name: 'Meena', email: 'meena@x.com', coachId: T2, trainerName: 'Asha Trainer', lastWorkout: null, workouts7d: 0, workouts30d: 0,
      engagement: { status: 'slipping', recent14: 1, prior28: 9 } },
    { id: 'c3', name: 'Kiran', email: 'kiran@x.com', coachId: null, trainerName: null, lastWorkout: null, workouts7d: 0, workouts30d: 0,
      engagement: { status: 'inactive', recent14: 0, prior28: 0 } }
  ],
  insights: {
    today: '2026-10-14',
    weekly: [0, 0, 1, 3, 4, 6, 5, 7].map((workouts) => ({ workouts, members: Math.min(3, workouts) })),
    peak: {
      total: 12,
      grid: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (d === 2 && h >= 17 && h < 20 ? 4 : 0)))
    },
    health: { thriving: 1, steady: 0, slipping: 1, quiet: 0, inactive: 1, new: 0 }
  }
});

const makeService = (result = payload()) => ({
  getOwnerGym: vi.fn(async () => result),
  ownerAssignClient: vi.fn(async () => ({ success: true, changed: true })),
  ownerUnassignClient: vi.fn(async () => ({ success: true, changed: true })),
  getOwnerMember: vi.fn(async (id) => ({
    success: true,
    member: { id, name: 'Meena', email: 'meena@x.com', goal: 'Fat loss', program: 'Gym Beginner', programStartedOn: '2026-09-02', totalSessions: 24, joinedAt: '2026-08-20T00:00:00Z', lastLogin: null },
    stats: { workouts30d: 9, workouts90d: 20, perWeek: 1.6, lastWorkout: '2026-10-10', weeks: [0, 0, 1, 2, 2, 3, 4, 3, 2, 1, 1, 1] },
    sessions: [{ date: '2026-10-10', plan: 'Upper A', exercises: 5, sets: 15, volumeKg: 3200 }],
    history: [
      { trainerName: 'Asha Trainer', startedAt: '2026-10-01T00:00:00Z', endedAt: null, how: 'Assigned by the gym owner' },
      { trainerName: 'You', startedAt: '2026-09-01T00:00:00Z', endedAt: '2026-10-01T00:00:00Z', how: 'Joined with their invite code' }
    ]
  }))
});

// The card holding this client's name (name → info column → top row → card).
const cardOf = (name) => screen.getByText(name).parentElement.parentElement.parentElement;
const openClients = async () => fireEvent.click(await screen.findByText('Clients (3)'));
const openTrainers = async () => fireEvent.click(await screen.findByText(/^Trainers \(\d+\)$/));

describe('OwnerGymDashboard', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('shows the gym, its code and the headline numbers', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    expect(await screen.findByText('Test Gym')).toBeTruthy();
    expect(screen.getByText('GYM-QFAP')).toBeTruthy();
    expect(screen.getByText('Trainers (2)')).toBeTruthy();
    expect(screen.getByText('Clients (3)')).toBeTruthy();
    // "This week" insights, not a repeat of the tab counts.
    expect(screen.getByText('Trained this week').previousSibling.textContent).toBe('1/3');
    expect(screen.getByText('Workouts this week').previousSibling.textContent).toBe('2');
    expect(screen.getByText('Not trained in 2 weeks').previousSibling.textContent).toBe('3');
    // every tile says it is tappable
    expect(screen.getAllByText('See who ›')).toHaveLength(3);
  });

  it('scores each trainer: clients, % still training, workouts per client per week', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    await openTrainers();
    expect(screen.getByText('Ordered by how many of each trainer’s clients are still training. Tap a trainer for their full picture.')).toBeTruthy();
    const asha = screen.getByTitle('Open Asha Trainer’s profile');
    expect(within(asha).getByText('0%')).toBeTruthy();
    expect(within(asha).getByText('1 client slipping or gone quiet')).toBeTruthy();
    const owner = screen.getByTitle('Open Test Gym Owner’s profile');
    expect(within(owner).getByText('100%')).toBeTruthy();
    expect(within(owner).getByText('2.5')).toBeTruthy();
    expect(within(owner).getByText('You')).toBeTruthy();
    // best-performing trainer first
    const order = screen.getAllByTitle(/^Open .* profile$/).map((b) => b.title);
    expect(order).toEqual(['Open Test Gym Owner’s profile', 'Open Asha Trainer’s profile']);
  });

  it('opens a trainer profile with their clients, weekly activity and a way to manage them', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    await openTrainers();
    fireEvent.click(screen.getByTitle('Open Asha Trainer’s profile'));
    const dialog = screen.getByRole('dialog', { name: 'Trainer' });
    expect(within(dialog).getByText('Asha Trainer')).toBeTruthy();
    expect(within(dialog).getByText('Their clients’ activity')).toBeTruthy();
    expect(within(dialog).getByText('Meena')).toBeTruthy();
    expect(within(dialog).getByText('Slipping')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Manage these clients' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Filter by trainer').value).toBe(T2);
    expect(screen.getByText('Meena')).toBeTruthy();
    expect(screen.queryByText('Ravi')).toBeNull();
  });

  it('shows each client’s status clearly: their trainer, or waiting', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    await openClients();
    expect(within(cardOf('Meena')).getByText('Trainer: Asha Trainer')).toBeTruthy();
    expect(within(cardOf('Ravi')).getByText('Trainer: You')).toBeTruthy();
    expect(within(cardOf('Kiran')).getByText('Waiting for a trainer')).toBeTruthy();
    expect(within(cardOf('Kiran')).getByRole('button', { name: 'Assign trainer' })).toBeTruthy();
    expect(within(cardOf('Meena')).getByRole('button', { name: 'Change' })).toBeTruthy();
  });

  it('nothing moves until the owner confirms a plain-language summary', async () => {
    const service = makeService();
    render(<OwnerGymDashboard service={service} />);
    await openClients();
    fireEvent.click(within(cardOf('Ravi')).getByRole('button', { name: 'Change' }));

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
    fireEvent.click(within(cardOf('Meena')).getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('radio', { name: /Waiting list/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(service.ownerUnassignClient).not.toHaveBeenCalled();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('unassigns a client back to the waiting list', async () => {
    const service = makeService();
    render(<OwnerGymDashboard service={service} />);
    await openClients();
    fireEvent.click(within(cardOf('Meena')).getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('radio', { name: /Waiting list/ }));
    expect(screen.getByText(/Remove Meena from Asha Trainer\? They go back to the waiting list/)).toBeTruthy();
    expect(service.ownerUnassignClient).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(service.ownerUnassignClient).toHaveBeenCalledWith('c2', false));
    expect(await screen.findByText(/Meena is back on the waiting list\./)).toBeTruthy();
  });

  it('a waiting client can be given a trainer; "No trainer" is not offered', async () => {
    const service = makeService();
    render(<OwnerGymDashboard service={service} />);
    await openClients();
    fireEvent.click(within(cardOf('Kiran')).getByRole('button', { name: 'Assign trainer' }));
    expect(screen.queryByRole('radio', { name: /Waiting list/ })).toBeNull();
    expect(screen.getByRole('radio', { name: /Trains on their own/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Asha Trainer/ }));
    expect(screen.getByText('Give Kiran to Asha Trainer as their trainer?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(service.ownerAssignClient).toHaveBeenCalledWith('c3', T2));
  });

  it('the filter reads in plain words', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    await openClients();
    const options = within(screen.getByLabelText('Filter by trainer')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['All clients', 'Trained this week (1)', 'Workouts this week (2)', 'Not trained in 2 weeks (3)', 'Members to watch (2)', 'Your clients', 'Asha Trainer’s clients', 'Waiting for a trainer (1)']);
    fireEvent.change(screen.getByLabelText('Filter by trainer'), { target: { value: '__unassigned__' } });
    expect(screen.getByText('Kiran')).toBeTruthy();
    expect(screen.queryByText('Ravi')).toBeNull();
  });

  it('shows a move error on the card and keeps the panel open', async () => {
    const service = makeService();
    service.ownerAssignClient.mockResolvedValue({ success: false, error: 'That trainer is not in your gym.' });
    render(<OwnerGymDashboard service={service} />);
    await openClients();
    fireEvent.click(within(cardOf('Ravi')).getByRole('button', { name: 'Change' }));
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
    expect(within(cardOf('Ravi')).getByRole('button', { name: 'Change' }).disabled).toBe(true);
  });

  it('an owner who does not coach is left out of trainers and the trainer list', async () => {
    const onChange = vi.fn();
    render(<OwnerGymDashboard service={makeService()} coachingOption={{ on: false, locked: false, onChange }} />);
    expect(await screen.findByText('Trainers (1)')).toBeTruthy();
    expect(screen.queryByText('Test Gym Owner')).toBeNull();
    fireEvent.click(screen.getByText('Clients (3)'));
    fireEvent.click(within(cardOf('Meena')).getByRole('button', { name: 'Change' }));
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

  it('marks a client as training on their own (no trainer wanted)', async () => {
    const service = makeService();
    render(<OwnerGymDashboard service={service} />);
    await openClients();
    fireEvent.click(within(cardOf('Meena')).getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('radio', { name: /Trains on their own/ }));
    expect(screen.getByText(/Remove Meena from Asha Trainer and mark them as training on their own\? They stay a gym member, leave the waiting list/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(service.ownerUnassignClient).toHaveBeenCalledWith('c2', true));
    expect(await screen.findByText(/Meena now trains on their own\./)).toBeTruthy();
  });

  it('a self-guided client shows as such, is not "waiting", and can be given a trainer or put on the waiting list', async () => {
    const result = payload();
    result.clients[2] = { ...result.clients[2], selfGuided: true };
    const service = makeService(result);
    render(<OwnerGymDashboard service={service} />);
    expect(await screen.findByText('Test Gym')).toBeTruthy();
    expect(screen.queryByText(/waiting for a trainer/)).toBeNull(); // no waiting banner
    await openClients();
    expect(within(cardOf('Kiran')).getByText('Trains on their own')).toBeTruthy();
    fireEvent.click(within(cardOf('Kiran')).getByRole('button', { name: 'Change' }));
    expect(screen.queryByRole('radio', { name: /Trains on their own/ })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Waiting list/ }));
    expect(screen.getByText(/Put Kiran back on the waiting list\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(service.ownerUnassignClient).toHaveBeenCalledWith('c3', false));
  });

  it('tapping an insight tile lists those clients', async () => {
    const result = payload();
    const recent = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    result.clients[0] = { ...result.clients[0], lastWorkout: recent };
    render(<OwnerGymDashboard service={makeService(result)} />);
    fireEvent.click((await screen.findByText('Not trained in 2 weeks')).closest('button'));
    expect(screen.getByLabelText('Filter by trainer').value).toBe('__nudge__');
    expect(screen.queryByText('Ravi')).toBeNull(); // worked out 2 days ago
    expect(screen.getByText('Meena')).toBeTruthy();

    fireEvent.click(screen.getByText('Trainers (2)'));
    fireEvent.click(screen.getByText('Trained this week').closest('button'));
    expect(screen.getByLabelText('Filter by trainer').value).toBe('__active__');
    expect(screen.getByText('Ravi')).toBeTruthy();
    expect(screen.queryByText('Meena')).toBeNull();
  });

  it('"Workouts this week" opens who trained and on which days, most active first', async () => {
    const result = payload();
    result.clients[0] = { ...result.clients[0], workouts7d: 2, recentDays: ['2026-10-15', '2026-10-13'] };
    result.clients[1] = { ...result.clients[1], workouts7d: 3, recentDays: ['2026-10-14', '2026-10-12', '2026-10-10'] };
    render(<OwnerGymDashboard service={makeService(result)} />);
    fireEvent.click((await screen.findByText('Workouts this week')).closest('button'));

    expect(screen.getByLabelText('Filter by trainer').value).toBe('__workouts__');
    expect(screen.getByText(/Workouts this week · 5 workouts by 2 members/)).toBeTruthy();
    expect(screen.getByText('Who trained in the last 7 days, and on which days.')).toBeTruthy();
    // Meena (3) listed before Ravi (2); Kiran (0) not listed
    const names = screen.getAllByText(/^(Ravi|Meena|Kiran)$/).map((n) => n.textContent);
    expect(names).toEqual(['Meena ›', 'Ravi ›']);
    expect(within(screen.getByLabelText('Days Meena trained this week')).getAllByText(/\d/)).toHaveLength(3);
    expect(within(screen.getByLabelText('Days Ravi trained this week')).getByText(/15 Oct/)).toBeTruthy();
  });

  it('the "not trained in 2 weeks" list explains itself and offers a WhatsApp message', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const result = payload();
    result.clients[1] = { ...result.clients[1], phone: '+919000000102' };
    render(<OwnerGymDashboard service={makeService(result)} />);
    fireEvent.click((await screen.findByText('Not trained in 2 weeks')).closest('button'));

    expect(screen.getByText(/Members with no workout logged in the last 14 days\./)).toBeTruthy();
    // no phone on file → says so instead of a dead button
    expect(within(cardOf('Kiran')).getByText('No phone number on file')).toBeTruthy();

    fireEvent.click(within(cardOf('Meena')).getByRole('button', { name: 'Message on WhatsApp' }));
    const url = new URL(open.mock.calls[0][0]);
    expect(url.searchParams.get('phone')).toBe('919000000102');
    expect(url.searchParams.get('text')).toMatch(/Hi Meena, we haven.t seen you at Test Gym in a while/);
  });

  it('empty tile lists say so in plain words', async () => {
    const result = payload();
    result.clients = result.clients.map((c) => ({ ...c, workouts7d: 0, lastWorkout: new Date(Date.now() - 86400000).toISOString().slice(0, 10) }));
    render(<OwnerGymDashboard service={makeService(result)} />);
    fireEvent.click((await screen.findByText('Not trained in 2 weeks')).closest('button'));
    expect(screen.getByText('Everyone’s been training 🎉')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter by trainer'), { target: { value: '__workouts__' } });
    expect(screen.getByText('No workouts yet this week')).toBeTruthy();
  });

  it('Overview shows the trend, member health, who to watch with why, busiest times and top members', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    expect(await screen.findByText('Workouts per week')).toBeTruthy();
    expect(screen.getByText('7 this week · up 2 from last week')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Week|workout days/ }).length).toBeGreaterThanOrEqual(8);

    // Member health legend, each with its text label
    expect(screen.getByText('Member health')).toBeTruthy();
    expect(screen.getByRole('button', { name: /1 Slipping/ })).toBeTruthy();

    // Members to watch: both at-risk members, slipping first, with the numbers behind it
    expect(screen.getByText('9 workouts in the 4 weeks before, 1 in the last 2 weeks.')).toBeTruthy();
    expect(screen.getByText('No workouts logged yet.')).toBeTruthy();

    // Busiest times
    expect(screen.getByText('Busiest time: Evening (5–8 pm) · Busiest day: Wednesday')).toBeTruthy();

    // Top members: only those with workouts in 30 days
    expect(screen.getByText('Most consistent this month')).toBeTruthy();
    expect(screen.getByText('5 days')).toBeTruthy();
  });

  it('tapping a health group lists those members', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    fireEvent.click(await screen.findByRole('button', { name: /1 Slipping/ }));
    expect(screen.getByLabelText('Filter by trainer').value).toBe('status:slipping');
    expect(screen.getByText('Trained often before, but under half as often in the last 2 weeks.')).toBeTruthy();
    expect(screen.getByText('Meena')).toBeTruthy();
    expect(screen.queryByText('Ravi')).toBeNull();
  });

  it('"See all" under Members to watch opens the risk list with reasons', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    fireEvent.click(await screen.findByRole('button', { name: /See all 2/ }));
    expect(screen.getByLabelText('Filter by trainer').value).toBe('__risk__');
    // slipping before never-started
    const names = screen.getAllByText(/^(Meena|Kiran)$/).map((n) => n.textContent);
    expect(names).toEqual(['Meena ›', 'Kiran ›']);
  });

  it('opens a member profile: activity, sessions, about and coaching history', async () => {
    const service = makeService();
    render(<OwnerGymDashboard service={service} />);
    await openClients();
    fireEvent.click(screen.getByRole('button', { name: 'Open Meena’s profile' }));
    const dialog = await screen.findByRole('dialog', { name: 'Member' });
    await waitFor(() => expect(service.getOwnerMember).toHaveBeenCalledWith('c2'));

    expect(await within(dialog).findByText('Recent sessions')).toBeTruthy();
    expect(within(dialog).getByText('Upper A')).toBeTruthy();
    expect(within(dialog).getByText('5 exercises · 15 sets · 3,200 kg lifted')).toBeTruthy();
    expect(within(dialog).getByText('Fat loss')).toBeTruthy();
    expect(within(dialog).getByText('Gym Beginner · started 2 Sep')).toBeTruthy();
    expect(within(dialog).getByText('9')).toBeTruthy(); // workouts in 30 days
    // who coached them, and how they came to be with them
    expect(within(dialog).getByText(/Assigned by the gym owner/)).toBeTruthy();
    expect(within(dialog).getByText(/Joined with their invite code/)).toBeTruthy();
    expect(within(dialog).getByText('Current')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Change trainer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Meena')).toBeTruthy(); // clients tab, searched by name
  });

  it('a member profile that cannot load says so', async () => {
    const service = makeService();
    service.getOwnerMember.mockResolvedValue({ success: false, error: 'That member isn’t in your gym.' });
    render(<OwnerGymDashboard service={service} />);
    await openClients();
    fireEvent.click(screen.getByRole('button', { name: 'Open Ravi’s profile' }));
    expect((await screen.findByRole('alert')).textContent).toBe('That member isn’t in your gym.');
  });

  it('never shows private notes or photos', async () => {
    render(<OwnerGymDashboard service={makeService()} />);
    await screen.findByText('Test Gym');
    fireEvent.click(screen.getByText('Clients (3)'));
    expect(screen.queryByText(/note/i)).toBeNull();
    expect(screen.queryByText(/photo/i)).toBeNull();
  });
});
