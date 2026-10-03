// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AdminSignupAlerts from './AdminSignupAlerts';

const alerts = [
  { id: 'a1', type: 'new_client_signup', clientId: 'c1', title: '🎉 New client joined', body: 'Anusha signed up as a self-guided user.', createdAt: new Date().toISOString() },
  { id: 'a2', type: 'signup_incomplete', clientId: 'c2', title: '⏸️ Sign-up not finished', body: 'Rahul created an account 3h ago but stopped.', createdAt: new Date().toISOString() },
  { id: 'a3', type: 'new_coach_signup', clientId: 'k1', title: '🏅 New coach joined', body: 'Ravi just signed up as a coach.', createdAt: new Date().toISOString() }
];

describe('AdminSignupAlerts', () => {
  afterEach(cleanup);

  it('renders nothing when there are no alerts', () => {
    const { container } = render(<AdminSignupAlerts alerts={[]} onOpen={() => {}} onDismiss={() => {}} onDismissAll={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows each alert with its text', () => {
    render(<AdminSignupAlerts alerts={alerts} onOpen={() => {}} onDismiss={() => {}} onDismissAll={() => {}} />);
    expect(screen.getByText('🆕 New sign-ups (3)')).toBeTruthy();
    expect(screen.getByText('Anusha signed up as a self-guided user.')).toBeTruthy();
    expect(screen.getByText('⏸️ Sign-up not finished')).toBeTruthy();
    expect(screen.getByText(/Tap to see coaches/)).toBeTruthy();
  });

  it('tapping opens, ✕ dismisses without opening, Clear all dismisses everything', () => {
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    const onDismissAll = vi.fn();
    render(<AdminSignupAlerts alerts={alerts} onOpen={onOpen} onDismiss={onDismiss} onDismissAll={onDismissAll} />);

    fireEvent.click(screen.getByText('Anusha signed up as a self-guided user.'));
    expect(onOpen).toHaveBeenCalledWith(alerts[0]);

    fireEvent.click(screen.getAllByLabelText('Dismiss')[1]);
    expect(onDismiss).toHaveBeenCalledWith(alerts[1]);
    expect(onOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Clear all'));
    expect(onDismissAll).toHaveBeenCalled();
  });
});
