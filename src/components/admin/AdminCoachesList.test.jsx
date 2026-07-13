// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AdminCoachesList from './AdminCoachesList';

describe('AdminCoachesList component', () => {
  afterEach(cleanup);

  const mockCoaches = [
    {
      id: 'coach-1',
      name: 'Subodh Mankala',
      email: 'subodh@gmail.com',
      brand: 'Subodh Fitness',
      experienceYears: 5,
      clientsCount: 8,
      isBlocked: false
    },
    {
      id: 'coach-2',
      name: 'Jaswanth Gone',
      email: 'jash@gmail.com',
      brand: 'S&C Training',
      experienceYears: null,
      clientsCount: 0,
      isBlocked: true
    }
  ];

  it('should render the list of coaches correctly', () => {
    render(
      <AdminCoachesList
        coachesList={mockCoaches}
        loadingAdmin={false}
        onToggleBlock={() => {}}
        onViewClients={() => {}}
      />
    );

    // Verify header count
    expect(screen.getByText('Coaches (2)')).toBeTruthy();

    // Verify coach details are rendered
    expect(screen.getByText('Subodh Mankala')).toBeTruthy();
    expect(screen.getByText('subodh@gmail.com')).toBeTruthy();
    expect(screen.getByText('Subodh Fitness')).toBeTruthy();
    expect(screen.getByText('5 yrs exp')).toBeTruthy();

    expect(screen.getByText('Jaswanth Gone')).toBeTruthy();
    expect(screen.getByText('jash@gmail.com')).toBeTruthy();
    expect(screen.getByText('S&C Training')).toBeTruthy();
  });

  it('should trigger onToggleBlock callback when block/unblock button is clicked', () => {
    const toggleBlockSpy = vi.fn();
    render(
      <AdminCoachesList
        coachesList={mockCoaches}
        loadingAdmin={false}
        onToggleBlock={toggleBlockSpy}
        onViewClients={() => {}}
      />
    );

    // Click block button for first coach
    const blockButtons = screen.getAllByRole('button');
    // First coach block button should say "Block"
    const firstBlockBtn = blockButtons.find(btn => btn.textContent === 'Block');
    expect(firstBlockBtn).toBeTruthy();
    fireEvent.click(firstBlockBtn);

    expect(toggleBlockSpy).toHaveBeenCalledTimes(1);
    expect(toggleBlockSpy).toHaveBeenCalledWith(mockCoaches[0]);

    // Second coach block button should say "Unblock"
    const secondBlockBtn = blockButtons.find(btn => btn.textContent === 'Unblock');
    expect(secondBlockBtn).toBeTruthy();
    fireEvent.click(secondBlockBtn);

    expect(toggleBlockSpy).toHaveBeenCalledTimes(2);
    expect(toggleBlockSpy).toHaveBeenCalledWith(mockCoaches[1]);
  });

  it('should trigger onViewClients callback when client count button is clicked', () => {
    const viewClientsSpy = vi.fn();
    render(
      <AdminCoachesList
        coachesList={mockCoaches}
        loadingAdmin={false}
        onToggleBlock={() => {}}
        onViewClients={viewClientsSpy}
      />
    );

    const clientCountBtns = screen.getAllByTitle('View clients');
    fireEvent.click(clientCountBtns[0]);

    expect(viewClientsSpy).toHaveBeenCalledTimes(1);
    expect(viewClientsSpy).toHaveBeenCalledWith(mockCoaches[0]);
  });
});
