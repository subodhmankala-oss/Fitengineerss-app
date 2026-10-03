import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CoachPlanHomeCard from './CoachPlanHomeCard';
import databaseService from '../services/databaseService';

vi.mock('../services/databaseService', () => ({
  default: { getWorkoutPlansForUser: vi.fn() }
}));

const recent = new Date(Date.now() - 86400000).toISOString();
const plans = [
  { id: 'p1', planName: 'Push Day', createdBy: 'coach', isAssigned: true, createdAt: recent, exercises: [{}, {}] },
  { id: 'p2', planName: 'My Template', createdBy: 'client', isAssigned: true, createdAt: recent, exercises: [{}] }
];

describe('CoachPlanHomeCard', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userId', 'u1');
    databaseService.getWorkoutPlansForUser.mockResolvedValue(plans);
  });

  it('shows a new coach plan and deep-links into Log Sets on Start', async () => {
    const onNavigate = vi.fn();
    render(<CoachPlanHomeCard userId="u1" logs={[]} onNavigateToWorkouts={onNavigate} />);

    expect(await screen.findByText('Push Day')).toBeTruthy();
    expect(screen.queryByText('My Template')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /start/i }));

    expect(onNavigate).toHaveBeenCalled();
    expect(localStorage.getItem('workoutTrackerLastTab_u1')).toBe('log');
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'))).toEqual({ coachPlanId: 'p1' });
  });

  it('renders nothing once the plan has been logged', async () => {
    const { container } = render(
      <CoachPlanHomeCard userId="u1" logs={[{ log_date: recent.slice(0, 10), plan_name: 'Push Day' }]} />
    );
    await vi.waitFor(() => expect(databaseService.getWorkoutPlansForUser).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
