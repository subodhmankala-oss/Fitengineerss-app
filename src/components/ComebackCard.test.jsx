// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/databaseService', () => ({
  __esModule: true,
  default: {
    getGenericWorkoutsByLevel: vi.fn()
  }
}));

import databaseService from '../services/databaseService';
import ComebackCard from './ComebackCard';

const logs = [
  { log_date: '2026-09-01', exercise_name: 'Bench Press', set_number: 1, reps: 8, session_row: 0 },
  { log_date: '2026-09-01', exercise_name: 'Barbell Row', set_number: 1, reps: 10, session_row: 1 },
];

const autoStart = () => JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ComebackCard', () => {
  it('starts a session built from the last workout and opens Workouts', () => {
    const onNavigate = vi.fn();
    render(<ComebackCard userId="u1" userName="Noona Rao" logs={logs} daysAway={4} onNavigateToWorkouts={onNavigate} onConnectCoach={() => {}} />);

    expect(screen.getByText(/Good to see you, Noona/)).toBeTruthy();
    expect(screen.getByText(/Based on your last workout/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Start a 10-min session/ }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(autoStart()).toEqual({
      name: '10-min Comeback',
      exercises: [
        { name: 'Bench Press', sets: 2, reps: '8' },
        { name: 'Barbell Row', sets: 2, reps: '10' },
      ],
    });
    expect(databaseService.getGenericWorkoutsByLevel).not.toHaveBeenCalled();
  });

  it('falls back to Home Beginner when history has nothing usable', async () => {
    databaseService.getGenericWorkoutsByLevel.mockResolvedValue([
      { name: 'Home Beginner Full Body A', exercises: [{ name: 'Squat', reps: '12', sets: 3 }, { name: 'Push Up', reps: '10', sets: 3 }] },
    ]);
    const cardioOnly = [{ log_date: '2026-09-01', exercise_name: 'Running', cardio_duration_seconds: 900 }];
    const onNavigate = vi.fn();
    render(<ComebackCard userId="u1" userName="" logs={cardioOnly} daysAway={9} onNavigateToWorkouts={onNavigate} onConnectCoach={() => {}} />);

    expect(screen.getByText(/No equipment needed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Start a 10-min session/ }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
    expect(databaseService.getGenericWorkoutsByLevel).toHaveBeenCalledWith('beginner', 'home');
    expect(autoStart().exercises.map(e => e.name)).toEqual(['Squat', 'Push Up']);
  });

  it('shows an error instead of navigating when no workout can be built', async () => {
    databaseService.getGenericWorkoutsByLevel.mockRejectedValue(new Error('offline'));
    const onNavigate = vi.fn();
    render(<ComebackCard userId="u1" userName="" logs={[]} daysAway={5} onNavigateToWorkouts={onNavigate} onConnectCoach={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Start a 10-min session/ }));
    await waitFor(() => expect(screen.getByText(/Couldn't load a workout/)).toBeTruthy());
    expect(onNavigate).not.toHaveBeenCalled();
    expect(autoStart()).toBeNull();
  });

  it('opens the connect-coach flow', () => {
    const onConnect = vi.fn();
    render(<ComebackCard userId="u1" userName="" logs={logs} daysAway={4} onNavigateToWorkouts={() => {}} onConnectCoach={onConnect} />);
    fireEvent.click(screen.getByRole('button', { name: /Get a coach/ }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('"Not today" hides it, and it stays hidden for the rest of the day', () => {
    const props = { userId: 'u1', userName: '', logs, daysAway: 4, onNavigateToWorkouts: () => {}, onConnectCoach: () => {} };
    const { container } = render(<ComebackCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Not today/ }));
    expect(container.innerHTML).toBe('');

    cleanup();
    const again = render(<ComebackCard {...props} />);
    expect(again.container.innerHTML).toBe('');
  });
});
