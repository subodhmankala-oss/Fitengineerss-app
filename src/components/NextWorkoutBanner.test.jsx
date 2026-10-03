// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

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
  localStorage.clear();
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

  it('asks a client with zero logged sessions for their level and Gym or Home, instead of assuming Gym', async () => {
    mockLibrary({
      gym: { beginner: gymBeginner },
      home: { beginner: [{ name: 'Home Beginner Full Body A', exercises: [] }] }
    });
    render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={() => {}} />);
    expect(await screen.findByText(/Let’s get you started/)).not.toBeNull();
    expect(screen.getByText('What’s your level?')).not.toBeNull();
    // Nothing is pre-selected; Start stays disabled until the level and
    // Gym or Home are both picked, and nothing auto-starts.
    expect(screen.getByRole('radio', { name: /^Beginner/ }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('At the gym')).not.toBeNull();
    expect(screen.getByText('At home')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Pick your level' }).disabled).toBe(true);
    expect(localStorage.getItem('workoutTrackerAutoStart_u1')).toBeNull();
    // No skip button here — this is the Home screen, not the sign-up wizard.
    expect(screen.queryByText(/start later/)).toBeNull();
  });

  it('has a ✕ that closes the picker and keeps it closed for that client on this device', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    const { unmount } = render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/Let’s get you started/)).toBeNull();
    expect(localStorage.getItem('firstWorkoutPickerDismissed_u1')).toBe('1');
    unmount();

    // Stays closed on the next visit...
    const again = render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={() => {}} />);
    await waitFor(() => expect(databaseService.getGenericWorkoutsByLevel).toHaveBeenCalled());
    expect(screen.queryByText(/Let’s get you started/)).toBeNull();
    again.unmount();

    // ...but another client on the same device still gets it.
    render(<NextWorkoutBanner userId="u2" logs={[]} onNavigateToWorkouts={() => {}} />);
    expect(await screen.findByText(/Let’s get you started/)).not.toBeNull();
  });

  it('closing the picker doesn’t hide the normal next-program banner once they have logged workouts', async () => {
    localStorage.setItem('firstWorkoutPickerDismissed_u1', '1');
    mockLibrary({ gym: { beginner: gymBeginner } });
    const logs = [{ log_date: '2026-09-01', plan_name: 'Beginner Full Body A' }];
    render(<NextWorkoutBanner userId="u1" logs={logs} onNavigateToWorkouts={() => {}} />);
    expect(await screen.findByText(/Keep going — next up/)).not.toBeNull();
  });

  it('uses the library it already loaded instead of fetching it a second time', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={() => {}} />);
    await screen.findByText('At the gym');
    expect(databaseService.getGenericWorkoutsByLevel).toHaveBeenCalledTimes(6); // 3 levels x 2 categories, once
  });

  it('only offers the Gym choice when no Home programs are configured, and vice versa', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } }); // no home library at all
    render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={() => {}} />);
    expect(await screen.findByText('At the gym')).not.toBeNull();
    expect(screen.queryByText('At home')).toBeNull();
  });

  it('deep-links to Gym Beginner A when the client picks "At the gym"', async () => {
    mockLibrary({
      gym: { beginner: gymBeginner },
      home: { beginner: [{ name: 'Home Beginner Full Body A', exercises: [] }] }
    });
    const onNavigate = vi.fn();
    render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={onNavigate} />);
    fireEvent.click(await screen.findByRole('radio', { name: /^Beginner/ }));
    fireEvent.click(screen.getByText('At the gym'));
    fireEvent.click(screen.getByRole('button', { name: 'Start my first workout 💪' }));
    expect(localStorage.getItem('workoutTrackerLastCategory_u1')).toBe('gym');
    expect(localStorage.getItem('workoutTrackerLastLevel_u1')).toBe('beginner');
    const autoStart = JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'));
    expect(autoStart.name).toBe('Beginner Full Body A');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('deep-links to Home Beginner A when the client picks "At home"', async () => {
    mockLibrary({
      gym: { beginner: gymBeginner },
      home: { beginner: [{ name: 'Home Beginner Full Body A', exercises: [] }] }
    });
    const onNavigate = vi.fn();
    render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={onNavigate} />);
    fireEvent.click(await screen.findByRole('radio', { name: /^Beginner/ }));
    fireEvent.click(screen.getByText('At home'));
    fireEvent.click(screen.getByRole('button', { name: 'Start my first workout 💪' }));
    expect(localStorage.getItem('workoutTrackerLastCategory_u1')).toBe('home');
    const autoStart = JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'));
    expect(autoStart.name).toBe('Home Beginner Full Body A');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('lets a client who already trains pick Intermediate and starts that level', async () => {
    mockLibrary({
      gym: {
        beginner: gymBeginner,
        intermediate: [{ name: 'Intermediate Push', exercises: [{ name: 'Bench Press' }] }]
      }
    });
    const onNavigate = vi.fn();
    render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={onNavigate} />);
    fireEvent.click(await screen.findByRole('radio', { name: /^Intermediate/ }));
    fireEvent.click(screen.getByText('At the gym'));
    fireEvent.click(screen.getByRole('button', { name: 'Start my first workout 💪' }));
    expect(localStorage.getItem('workoutTrackerLastLevel_u1')).toBe('intermediate');
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'))).toMatchObject({ name: 'Intermediate Push', level: 'intermediate' });
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

  it('keeps showing guidance even with many sessions logged (no session-count cutoff)', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    const logs = Array.from({ length: 20 }, (_, i) => ({
      log_date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
      plan_name: 'Beginner Full Body A'
    }));
    render(<NextWorkoutBanner userId="u1" logs={logs} onNavigateToWorkouts={() => {}} />);
    // Leveling is time-based (see beginnerGuidance.js), not session-count
    // based, so 20 sessions logged within the same short window stays on
    // Beginner and keeps recommending the next program — it doesn't vanish.
    expect(await screen.findByText(/Keep going — next up/)).not.toBeNull();
  });

  it('announces leveling up once ~3 months have passed since the first-ever session', async () => {
    mockLibrary({ gym: { beginner: gymBeginner, intermediate: [{ name: 'Intermediate Push', exercises: [] }] } });
    // Leveling is time-based now (see beginnerGuidance.js's WEEKS_PER_LEVEL)
    // — the component always uses the real clock, so this needs a genuinely
    // old first-session date rather than a fixed literal one.
    const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const logs = [{ log_date: daysAgo(100), plan_name: 'Beginner Full Body A' }]; // ~14 weeks ago
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
