// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

vi.mock('../services/databaseService', () => ({
  __esModule: true,
  default: {
    getGenericWorkoutsByLevel: vi.fn()
  }
}));

import databaseService from '../services/databaseService';
import BeginnerNextWorkoutBanner from './BeginnerNextWorkoutBanner';

const beginnerPrograms = [
  { name: 'Beginner Full Body A' },
  { name: 'Beginner Full Body B' },
  { name: 'Beginner Lower & Core' }
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BeginnerNextWorkoutBanner', () => {
  it('renders nothing while the beginner library is still loading', () => {
    databaseService.getGenericWorkoutsByLevel.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<BeginnerNextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when there is no beginner library configured', async () => {
    databaseService.getGenericWorkoutsByLevel.mockResolvedValue([]);
    const { container } = render(<BeginnerNextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={() => {}} />);
    await waitFor(() => expect(databaseService.getGenericWorkoutsByLevel).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('suggests the first program for a client with no logged sessions', async () => {
    databaseService.getGenericWorkoutsByLevel.mockResolvedValue(beginnerPrograms);
    render(<BeginnerNextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={() => {}} />);
    expect(await screen.findByText(/New here\? Start with this/)).not.toBeNull();
    expect(screen.getByText(/Beginner Full Body A/)).not.toBeNull();
  });

  it('suggests the next program after the most recently logged one', async () => {
    databaseService.getGenericWorkoutsByLevel.mockResolvedValue(beginnerPrograms);
    const logs = [
      { log_date: '2026-09-01', plan_name: 'Beginner Full Body A' },
      { log_date: '2026-09-05', plan_name: 'Beginner Full Body B' }
    ];
    render(<BeginnerNextWorkoutBanner userId="u1" logs={logs} onNavigateToWorkouts={() => {}} />);
    expect(await screen.findByText(/Keep going — next up/)).not.toBeNull();
    expect(screen.getByText(/Nice work on Beginner Full Body B! Next up: Beginner Lower & Core\./)).not.toBeNull();
  });

  it('renders nothing once the client has logged 12+ sessions', async () => {
    databaseService.getGenericWorkoutsByLevel.mockResolvedValue(beginnerPrograms);
    const logs = Array.from({ length: 12 }, (_, i) => ({
      log_date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      plan_name: 'Beginner Full Body A'
    }));
    const { container } = render(<BeginnerNextWorkoutBanner userId="u1" logs={logs} onNavigateToWorkouts={() => {}} />);
    await waitFor(() => expect(databaseService.getGenericWorkoutsByLevel).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('writes the last-tab/last-level localStorage keys and navigates on click', async () => {
    databaseService.getGenericWorkoutsByLevel.mockResolvedValue(beginnerPrograms);
    const onNavigate = vi.fn();
    render(<BeginnerNextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={onNavigate} />);
    const banner = await screen.findByRole('button');
    banner.click();
    expect(localStorage.getItem('workoutTrackerLastTab_u1')).toBe('templates');
    expect(localStorage.getItem('workoutTrackerLastLevel_u1')).toBe('beginner');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
