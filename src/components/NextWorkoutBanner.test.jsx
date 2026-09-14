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
import NextWorkoutBanner from './NextWorkoutBanner';

const gymBeginner = [
  { name: 'Beginner Full Body A', exercises: [] },
  { name: 'Beginner Full Body B', exercises: [] },
  { name: 'Beginner Lower & Core', exercises: [] }
];

// The component fetches all 6 (level x category) lists up front — mock
// per-call so tests can populate only what they need and leave the rest
// empty, same as a category/level with no configured programs.
function mockLibrary({ gym = {}, home = {} } = {}) {
  databaseService.getGenericWorkoutsByLevel.mockImplementation((level, category = 'gym') => {
    const lib = category === 'home' ? home : gym;
    return Promise.resolve(lib[level] || []);
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NextWorkoutBanner', () => {
  it('renders nothing while the library is still loading', () => {
    databaseService.getGenericWorkoutsByLevel.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no library is configured at all', async () => {
    mockLibrary({});
    const { container } = render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={() => {}} />);
    await waitFor(() => expect(databaseService.getGenericWorkoutsByLevel).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('asks a client with zero logged sessions to choose Gym or Home, instead of assuming Gym', async () => {
    mockLibrary({
      gym: { beginner: gymBeginner },
      home: { beginner: [{ name: 'Home Beginner Full Body A', exercises: [] }] }
    });
    render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={() => {}} />);
    expect(await screen.findByText(/Let's get you started/)).not.toBeNull();
    expect(screen.getByText(/I have gym access/)).not.toBeNull();
    expect(screen.getByText(/I'm training at home/)).not.toBeNull();
    // Neither option is auto-started until the client actually picks one.
    expect(localStorage.getItem('workoutTrackerAutoStart_u1')).toBeNull();
  });

  it('only offers the Gym choice when no Home programs are configured, and vice versa', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } }); // no home library at all
    render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={() => {}} />);
    expect(await screen.findByText(/I have gym access/)).not.toBeNull();
    expect(screen.queryByText(/I'm training at home/)).toBeNull();
  });

  it('deep-links to Gym Beginner A when the client picks "I have gym access"', async () => {
    mockLibrary({
      gym: { beginner: gymBeginner },
      home: { beginner: [{ name: 'Home Beginner Full Body A', exercises: [] }] }
    });
    const onNavigate = vi.fn();
    render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={onNavigate} />);
    (await screen.findByText(/I have gym access/)).click();
    expect(localStorage.getItem('workoutTrackerLastCategory_u1')).toBe('gym');
    expect(localStorage.getItem('workoutTrackerLastLevel_u1')).toBe('beginner');
    const autoStart = JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'));
    expect(autoStart.name).toBe('Beginner Full Body A');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('deep-links to Home Beginner A when the client picks "I\'m training at home"', async () => {
    mockLibrary({
      gym: { beginner: gymBeginner },
      home: { beginner: [{ name: 'Home Beginner Full Body A', exercises: [] }] }
    });
    const onNavigate = vi.fn();
    render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={onNavigate} />);
    (await screen.findByText(/I'm training at home/)).click();
    expect(localStorage.getItem('workoutTrackerLastCategory_u1')).toBe('home');
    const autoStart = JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'));
    expect(autoStart.name).toBe('Home Beginner Full Body A');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('suggests the next program after the most recently logged one', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    const logs = [
      { log_date: '2026-09-01', plan_name: 'Beginner Full Body A' },
      { log_date: '2026-09-05', plan_name: 'Beginner Full Body B' }
    ];
    render(<NextWorkoutBanner userId="u1" logs={logs} onNavigateToWorkouts={() => {}} />);
    expect(await screen.findByText(/Keep going — next up/)).not.toBeNull();
    expect(screen.getByText(/Nice work on Beginner Full Body B! Next up: Beginner Lower & Core\./)).not.toBeNull();
  });

  it('renders nothing once the client has logged 12+ sessions', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    const logs = Array.from({ length: 12 }, (_, i) => ({
      log_date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      plan_name: 'Beginner Full Body A'
    }));
    const { container } = render(<NextWorkoutBanner userId="u1" logs={logs} onNavigateToWorkouts={() => {}} />);
    await waitFor(() => expect(databaseService.getGenericWorkoutsByLevel).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('announces leveling up once all Beginner programs are cleared', async () => {
    mockLibrary({ gym: { beginner: gymBeginner, intermediate: [{ name: 'Intermediate Push', exercises: [] }] } });
    const logs = [
      { log_date: '2026-09-01', plan_name: 'Beginner Full Body A' },
      { log_date: '2026-09-02', plan_name: 'Beginner Full Body B' },
      { log_date: '2026-09-03', plan_name: 'Beginner Lower & Core' }
    ];
    render(<NextWorkoutBanner userId="u1" logs={logs} onNavigateToWorkouts={() => {}} />);
    expect(await screen.findByText(/Intermediate unlocked!/)).not.toBeNull();
    expect(screen.getByText(/Intermediate Push/)).not.toBeNull();
  });

  it('writes the last-tab/last-level/last-category and auto-start localStorage keys, then navigates on click (has-history case, not the zero-session choice)', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    const onNavigate = vi.fn();
    const logs = [{ log_date: '2026-09-01', plan_name: 'Beginner Full Body A' }];
    render(<NextWorkoutBanner userId="u1" logs={logs} onNavigateToWorkouts={onNavigate} />);
    const banner = await screen.findByRole('button');
    banner.click();
    expect(localStorage.getItem('workoutTrackerLastTab_u1')).toBe('templates');
    expect(localStorage.getItem('workoutTrackerLastLevel_u1')).toBe('beginner');
    expect(localStorage.getItem('workoutTrackerLastCategory_u1')).toBe('gym');
    const autoStart = JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'));
    expect(autoStart.name).toBe('Beginner Full Body B');
    expect(autoStart.level).toBe('beginner');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('deep-links into Home programs when that is where the client is active', async () => {
    mockLibrary({
      gym: { beginner: gymBeginner },
      home: { beginner: [{ name: 'Home Beginner Full Body A', exercises: [] }, { name: 'Home Beginner Full Body B', exercises: [] }] }
    });
    const logs = [{ log_date: '2026-09-01', plan_name: 'Home Beginner Full Body A' }];
    render(<NextWorkoutBanner userId="u1" logs={logs} onNavigateToWorkouts={() => {}} />);
    const banner = await screen.findByRole('button');
    banner.click();
    expect(localStorage.getItem('workoutTrackerLastCategory_u1')).toBe('home');
    const autoStart = JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'));
    expect(autoStart.name).toBe('Home Beginner Full Body B');
  });
});
