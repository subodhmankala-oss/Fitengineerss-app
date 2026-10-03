// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AdminClientsList from './AdminClientsList';

describe('AdminClientsList component', () => {
  afterEach(cleanup);

  const mockClients = [
    {
      id: 'client-1',
      userName: 'Jaswanth Gone',
      email: 'gonejaswanth@gmail.com',
      userGoal: 'Fat Loss',
      coach_id: 'coach-1'
    },
    {
      id: 'client-2',
      userName: 'Subodh Guest',
      email: 'subodh.guest@gmail.com',
      userGoal: 'Muscle Building',
      coach_id: null
    }
  ];

  const mockCoaches = [
    {
      id: 'coach-1',
      name: 'Coach Ravi'
    }
  ];

  it('should render the list of clients correctly', () => {
    render(
      <AdminClientsList
        clients={mockClients}
        goalFilter="All"
        setGoalFilter={() => {}}
        loadingClients={false}
        coachesList={mockCoaches}
        onSelectCoachDetails={() => {}}
      />
    );

    // Verify header count
    expect(screen.getByText('All Clients (2)')).toBeTruthy();

    // Verify details are rendered
    expect(screen.getByText('Jaswanth Gone')).toBeTruthy();
    expect(screen.getByText('gonejaswanth@gmail.com')).toBeTruthy();
    expect(screen.getByText('🎯 Fat Loss')).toBeTruthy();
    expect(screen.getByText('👤 Coach: Coach Ravi')).toBeTruthy(); // Resolved coach name!

    expect(screen.getByText('Subodh Guest')).toBeTruthy();
    expect(screen.getByText('subodh.guest@gmail.com')).toBeTruthy();
    expect(screen.getByText('🎯 Muscle Building')).toBeTruthy();
    expect(screen.getByText('👤 Self-Guided')).toBeTruthy();
  });

  it('shows the second goal on the goal chip when the client picked two', () => {
    render(
      <AdminClientsList
        clients={[{ id: 'c3', userName: 'Two Goals', email: 'two@x.com', userGoal: 'Fat Loss', userSecondaryGoal: 'Gut Health', coach_id: null }]}
        goalFilter="All"
        setGoalFilter={() => {}}
        loadingClients={false}
        coachesList={[]}
        onSelectCoachDetails={() => {}}
      />
    );
    expect(screen.getByText('🎯 Fat Loss + Gut Health')).toBeTruthy();
  });

  it('should trigger setGoalFilter when filter tag buttons are clicked', () => {
    const setGoalFilterSpy = vi.fn();
    render(
      <AdminClientsList
        clients={mockClients}
        goalFilter="All"
        setGoalFilter={setGoalFilterSpy}
        loadingClients={false}
        coachesList={mockCoaches}
        onSelectCoachDetails={() => {}}
      />
    );

    const fatLossBtn = screen.getByRole('button', { name: 'Fat Loss' });
    fireEvent.click(fatLossBtn);

    expect(setGoalFilterSpy).toHaveBeenCalledTimes(1);
    expect(setGoalFilterSpy).toHaveBeenCalledWith('Fat Loss');
  });

  it('should trigger onSelectCoachDetails when attached coach pill is clicked', () => {
    const selectCoachSpy = vi.fn();
    render(
      <AdminClientsList
        clients={mockClients}
        goalFilter="All"
        setGoalFilter={() => {}}
        loadingClients={false}
        coachesList={mockCoaches}
        onSelectCoachDetails={selectCoachSpy}
      />
    );

    const coachPill = screen.getByText('👤 Coach: Coach Ravi');
    fireEvent.click(coachPill);

    expect(selectCoachSpy).toHaveBeenCalledTimes(1);
    expect(selectCoachSpy).toHaveBeenCalledWith(mockCoaches[0]);
  });

  it('should toggle activityFilter when a summary tile is clicked', () => {
    const setActivityFilterSpy = vi.fn();
    render(
      <AdminClientsList
        clients={mockClients}
        goalFilter="All"
        setGoalFilter={() => {}}
        activityFilter={null}
        setActivityFilter={setActivityFilterSpy}
        loadingClients={false}
        coachesList={mockCoaches}
        onSelectCoachDetails={() => {}}
      />
    );

    const neverTile = screen.getByText('Never logged in');
    fireEvent.click(neverTile);

    expect(setActivityFilterSpy).toHaveBeenCalledTimes(1);
    expect(setActivityFilterSpy).toHaveBeenCalledWith('never');
  });

  it('should un-set activityFilter when the active tile is clicked again', () => {
    const setActivityFilterSpy = vi.fn();
    render(
      <AdminClientsList
        clients={mockClients}
        goalFilter="All"
        setGoalFilter={() => {}}
        activityFilter="never"
        setActivityFilter={setActivityFilterSpy}
        loadingClients={false}
        coachesList={mockCoaches}
        onSelectCoachDetails={() => {}}
      />
    );

    const neverTile = screen.getByText('Never logged in');
    fireEvent.click(neverTile);

    expect(setActivityFilterSpy).toHaveBeenCalledTimes(1);
    expect(setActivityFilterSpy).toHaveBeenCalledWith(null);
  });

  it('should filter the client list by activity status', () => {
    render(
      <AdminClientsList
        clients={mockClients}
        goalFilter="All"
        setGoalFilter={() => {}}
        activityFilter="never"
        setActivityFilter={() => {}}
        loadingClients={false}
        coachesList={mockCoaches}
        onSelectCoachDetails={() => {}}
      />
    );

    // Neither mock client has a last_login, so both fall under "never" and both should render.
    expect(screen.getByText('Jaswanth Gone')).toBeTruthy();
    expect(screen.getByText('Subodh Guest')).toBeTruthy();
  });

  it('should filter clients by the search box (name, email or coach) and clear it', () => {
    render(
      <AdminClientsList
        clients={mockClients}
        goalFilter="All"
        setGoalFilter={() => {}}
        loadingClients={false}
        coachesList={mockCoaches}
        onSelectCoachDetails={() => {}}
      />
    );

    const input = screen.getByPlaceholderText(/Search client/);

    fireEvent.change(input, { target: { value: 'guest@' } });
    expect(screen.queryByText('Jaswanth Gone')).toBeNull();
    expect(screen.getByText('Subodh Guest')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'ravi' } });
    expect(screen.getByText('Jaswanth Gone')).toBeTruthy();
    expect(screen.queryByText('Subodh Guest')).toBeNull();

    fireEvent.change(input, { target: { value: 'nobody' } });
    expect(screen.getByText('No Clients Found')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(screen.getByText('Jaswanth Gone')).toBeTruthy();
    expect(screen.getByText('Subodh Guest')).toBeTruthy();
  });

  describe('new sign-ups', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const signupClients = [
      { id: 'old', userName: 'Old Client', email: 'old@x.com', joined_at: new Date(Date.now() - 30 * DAY).toISOString() },
      { id: 'newest', userName: 'Newest Client', email: 'newest@x.com', joined_at: new Date(Date.now() - 1 * DAY).toISOString() },
      { id: 'undated', userName: 'Undated Client', email: 'undated@x.com' },
      { id: 'recent', userName: null, email: 'noname@x.com', joined_at: new Date(Date.now() - 3 * DAY).toISOString() }
    ];

    const renderList = (props = {}) => render(
      <AdminClientsList
        clients={signupClients}
        goalFilter="All"
        setGoalFilter={() => {}}
        loadingClients={false}
        coachesList={[]}
        onSelectCoachDetails={() => {}}
        {...props}
      />
    );

    it('lists newest sign-ups first, undated rows last', () => {
      renderList();
      const emails = screen.getAllByText(/@x\.com$/).map(el => el.textContent);
      expect(emails).toEqual(['newest@x.com', 'noname@x.com', 'old@x.com', 'undated@x.com']);
    });

    it('counts and badges clients who joined in the last 7 days', () => {
      renderList();
      const tile = screen.getByText('New this week').parentElement;
      expect(tile.textContent).toContain('2');
      expect(screen.getAllByText('NEW')).toHaveLength(2);
      expect(screen.getByText('No name yet')).toBeTruthy();
    });

    it('clicking the tile filters to new sign-ups, clicking again clears it', () => {
      const setActivityFilter = vi.fn();
      renderList({ setActivityFilter });
      fireEvent.click(screen.getByText('New this week'));
      expect(setActivityFilter).toHaveBeenCalledWith('new');
      cleanup();

      renderList({ activityFilter: 'new', setActivityFilter });
      expect(screen.getByText('newest@x.com')).toBeTruthy();
      expect(screen.getByText('noname@x.com')).toBeTruthy();
      expect(screen.queryByText('old@x.com')).toBeNull();
      expect(screen.queryByText('undated@x.com')).toBeNull();
      fireEvent.click(screen.getByText('New this week'));
      expect(setActivityFilter).toHaveBeenLastCalledWith(null);
    });
  });
});
