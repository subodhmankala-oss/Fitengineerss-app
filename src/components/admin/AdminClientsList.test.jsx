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
});
