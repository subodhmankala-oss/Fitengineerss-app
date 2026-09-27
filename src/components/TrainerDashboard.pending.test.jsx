// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TrainerDashboard from './TrainerDashboard';
import { CoachTourProvider } from '../context/CoachTourContext';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const renderDashboard = () =>
  render(
    <CoachTourProvider>
      <TrainerDashboard handleLogout={vi.fn()} />
    </CoachTourProvider>
  );

// The pending screen used to be an early return in front of ~150 hooks, so
// any render where the role check flipped changed the hook count and crashed.
// It's now its own component chosen by a thin wrapper.
describe('TrainerDashboard role gate', () => {
  it('shows the pending screen to a coach awaiting approval', () => {
    localStorage.setItem('userRole', 'coach_pending');
    localStorage.setItem('userEmail', 'pending-coach@example.com');
    renderDashboard();
    expect(screen.getByText(/Application Pending/)).toBeTruthy();
  });

  it('switches from pending to the full dashboard without a hook-order crash', () => {
    localStorage.setItem('userRole', 'coach_pending');
    localStorage.setItem('userEmail', 'coach@example.com');
    const { rerender } = renderDashboard();
    expect(screen.getByText(/Application Pending/)).toBeTruthy();
    localStorage.setItem('userRole', 'coach');
    rerender(
      <CoachTourProvider>
        <TrainerDashboard handleLogout={vi.fn()} />
      </CoachTourProvider>
    );
    expect(screen.queryByText(/Application Pending/)).toBeNull();
  });
});
