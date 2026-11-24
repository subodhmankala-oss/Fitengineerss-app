// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../services/databaseService', () => ({
  __esModule: true,
  default: {
    getGenericWorkoutsByLevel: vi.fn(),
    getLibraryLevelPref: vi.fn(() => Promise.resolve(null)),
    saveLibraryLevelPref: vi.fn(() => Promise.resolve()),
    getLibraryDays: vi.fn(() => Promise.resolve({ days: [0, 2, 5], since: '2026-11-01' })),
    saveLibraryDays: vi.fn(() => Promise.resolve())
  }
}));

import databaseService from '../services/databaseService';
import NextWorkoutBanner from './NextWorkoutBanner';

const gymBeginner = [
  { name: 'Beginner Full Body A', exercises: [] },
  { name: 'Beginner Full Body B', exercises: [] },
  { name: 'Beginner Lower & Core', exercises: [] }
];
const homeBeginner = [
  { name: 'Home Beginner Full Body A', exercises: [] },
  { name: 'Home Beginner Full Body B', exercises: [] }
];
const ex = (...names) => names.map(name => ({ name, sets: 3, reps: '10' }));
const realBeginner = [
  { name: 'Beginner Full Body A', exercises: ex('Goblet Squat', 'Push-up', 'Dumbbell Row', 'Plank') },
  { name: 'Beginner Full Body B', exercises: ex('Leg Press', 'Chest Press (Machine)', 'Seated Row (Machine)', 'Dead Bug') },
  { name: 'Beginner Lower & Core', exercises: ex('Dumbbell Squat', 'Glute Bridge', 'Calf Raise (Standing)', 'Crunch') }
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

const show = (props = {}) => render(<NextWorkoutBanner userId="u1" logs={[]} onNavigateToWorkouts={() => {}} {...props} />);
const did = (log_date, plan_name, extra = {}) => ({ log_date, plan_name, ...extra });
// The big card, and the strip under it.
const bigCard = () => document.querySelector('.wpc-row.main');
const smallCards = () => [...document.querySelectorAll('.wpc-small')].map(b => b.getAttribute('aria-label'));

// Pinned: the logs below have fixed dates, a level steps up after 12 weeks,
// and the cards depend on the weekday. 2026-11-11 is a Wednesday.
// Only Date is pinned; timers stay real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-11T12:00:00') });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('NextWorkoutBanner — making the plan', () => {
  it('renders nothing while the library is still loading', () => {
    databaseService.getGenericWorkoutsByLevel.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = show();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no library is configured at all', async () => {
    mockLibrary({});
    const { container } = show();
    await waitFor(() => expect(databaseService.getGenericWorkoutsByLevel).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it('asks a client with zero logged sessions for level, place and days — Mon, Wed, Sat already on', async () => {
    mockLibrary({ gym: { beginner: gymBeginner }, home: { beginner: homeBeginner } });
    show();
    expect(await screen.findByText('Let’s make your workout plan')).not.toBeNull();
    expect(screen.getByRole('radio', { name: /^Beginner/ }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: 'At the gym' }).getAttribute('aria-checked')).toBe('false');
    const on = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      .filter(d => screen.getByRole('button', { name: d }).getAttribute('aria-pressed') === 'true');
    expect(on).toEqual(['Monday', 'Wednesday', 'Saturday']);
    expect(screen.getByRole('button', { name: 'Pick your level' }).disabled).toBe(true);
    expect(localStorage.getItem('workoutTrackerAutoStart_u1')).toBeNull();
  });

  it('"Make my plan" saves level, place and days and shows every day full size, without starting anything', async () => {
    mockLibrary({ gym: { beginner: gymBeginner }, home: { beginner: homeBeginner } });
    const onNavigate = vi.fn();
    show({ onNavigateToWorkouts: onNavigate });
    fireEvent.click(await screen.findByRole('radio', { name: /^Beginner/ }));
    expect(screen.getByRole('button', { name: 'Pick gym or home' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'At the gym' }));
    fireEvent.click(screen.getByRole('button', { name: 'Friday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make my plan' }));

    expect(databaseService.saveLibraryLevelPref).toHaveBeenCalledWith('u1', { level: 'beginner', category: 'gym' }, null);
    expect(databaseService.saveLibraryDays).toHaveBeenCalledWith('u1', { days: [0, 2, 4, 5], since: '2026-11-11' });
    expect(screen.getByText('Your plan is ready')).not.toBeNull();
    // Wednesday today: Wed, Fri, Sat are left this week.
    expect([...document.querySelectorAll('.wpc-row')].map(r => r.getAttribute('aria-label').split(' — ')[0]))
      .toEqual(['Start Beginner Full Body A', 'Start Beginner Full Body B', 'Start Beginner Lower & Core']);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('workoutTrackerAutoStart_u1')).toBeNull();
  });

  it('needs at least one day', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    show();
    fireEvent.click(await screen.findByRole('radio', { name: /^Beginner/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'At the gym' }));
    ['Monday', 'Wednesday', 'Saturday'].forEach(name => fireEvent.click(screen.getByRole('button', { name })));
    expect(screen.getByRole('button', { name: 'Pick your days' }).disabled).toBe(true);
  });

  it('plays the Home program when the client trains at home', async () => {
    mockLibrary({ gym: { beginner: gymBeginner }, home: { beginner: homeBeginner } });
    const onNavigate = vi.fn();
    show({ onNavigateToWorkouts: onNavigate });
    fireEvent.click(await screen.findByRole('radio', { name: /^Beginner/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'At home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make my plan' }));
    fireEvent.click(bigCard());
    expect(localStorage.getItem('workoutTrackerLastCategory_u1')).toBe('home');
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1')).name).toBe('Home Beginner Full Body A');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('lets a client who already trains pick Intermediate', async () => {
    mockLibrary({ gym: { beginner: gymBeginner, intermediate: [{ name: 'Intermediate Push', exercises: ex('Bench Press') }] } });
    show();
    fireEvent.click(await screen.findByRole('radio', { name: /^Intermediate/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'At the gym' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make my plan' }));
    expect(screen.getByText('Intermediate · Gym')).not.toBeNull();
    fireEvent.click(bigCard());
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'))).toMatchObject({ name: 'Intermediate Push', level: 'intermediate' });
  });

  it('has a ✕ that closes the picker until the app is next opened, per client', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    const { unmount } = show();
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/Let’s make your workout plan/)).toBeNull();
    expect(sessionStorage.getItem('firstWorkoutPickerDismissed_u1')).toBe('1');
    unmount();

    // Stays closed while the app stays open...
    const again = show();
    expect(await screen.findByRole('button', { name: /Make your workout plan/ })).not.toBeNull();
    again.unmount();

    // ...another client on the same device still gets it...
    const other = show({ userId: 'u2' });
    expect(await screen.findByText(/Let’s make your workout plan/)).not.toBeNull();
    other.unmount();

    // ...and the next time the app is opened, the full card is back.
    sessionStorage.clear();
    show();
    expect(await screen.findByText(/Let’s make your workout plan/)).not.toBeNull();
  });

  it('after closing, a row stays and reopens the picker', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: /Make your workout plan/ }));
    expect(screen.getByText(/Let’s make your workout plan/)).not.toBeNull();
    expect(sessionStorage.getItem('firstWorkoutPickerDismissed_u1')).toBeNull();
  });

  it('the moment the first workout is saved, the picker is replaced by the week, with it ticked', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    const { rerender } = show();
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    // The home screen reloads its logs on 'workoutSessionsUpdated'.
    rerender(<NextWorkoutBanner userId="u1" logs={[did('2026-11-11', 'Beginner Full Body A', { calories_burned: 240 })]} onNavigateToWorkouts={() => {}} />);
    expect(screen.queryByText(/workout plan/)).toBeNull();
    expect(smallCards()).toContain('Beginner Full Body A, done');
    expect(screen.getByText(/240 kcal/)).not.toBeNull();
  });

  it('uses the library it already loaded instead of fetching it a second time', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    show();
    await screen.findByText('At the gym');
    expect(databaseService.getGenericWorkoutsByLevel).toHaveBeenCalledTimes(6); // 3 levels x 2 categories, once
  });

  it('only offers the Gym choice when no Home programs are configured', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    show();
    expect(await screen.findByText('At the gym')).not.toBeNull();
    expect(screen.queryByText('At home')).toBeNull();
  });
});

describe('NextWorkoutBanner — the week', () => {
  const lastWeek = [did('2026-11-04', 'Beginner Full Body A')];

  it('today’s workout is big and the other days sit in the strip', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    show({ logs: lastWeek }); // carries on after A: Mon B, Wed C, Sat A
    expect(await screen.findByText('Your week')).not.toBeNull();
    expect(bigCard().getAttribute('aria-label')).toMatch(/^Start Beginner Lower & Core/);
    expect(bigCard().textContent).toContain('Today');
    expect(smallCards()).toEqual(['Start Beginner Full Body B', 'Start Beginner Full Body A']);
  });

  it('any card plays: the strip’s starts its own program', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    const onNavigate = vi.fn();
    show({ logs: lastWeek, onNavigateToWorkouts: onNavigate });
    fireEvent.click(await screen.findByRole('button', { name: 'Start Beginner Full Body A' }));
    expect(localStorage.getItem('workoutTrackerLastTab_u1')).toBe('templates');
    expect(localStorage.getItem('workoutTrackerLastLevel_u1')).toBe('beginner');
    expect(localStorage.getItem('workoutTrackerLastCategory_u1')).toBe('gym');
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'))).toMatchObject({ name: 'Beginner Full Body A', level: 'beginner' });
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('a done card can’t be started again', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    show({ logs: [...lastWeek, did('2026-11-09', 'Beginner Full Body B')] });
    expect((await screen.findByRole('button', { name: 'Beginner Full Body B, done' })).disabled).toBe(true);
  });

  it('a finished week folds to one line that still offers the next workout', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    vi.setSystemTime(new Date('2026-11-14T12:00:00')); // Saturday
    const onNavigate = vi.fn();
    show({
      logs: [...lastWeek, did('2026-11-09', 'Beginner Full Body B'), did('2026-11-11', 'Beginner Lower & Core'), did('2026-11-14', 'Beginner Full Body A')],
      onNavigateToWorkouts: onNavigate
    });
    expect(await screen.findByText('Week done, 3 of 3')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start Beginner Full Body B' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('Change days saves the new days from today, and Cancel keeps the old ones', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    show({ logs: lastWeek });
    fireEvent.click(await screen.findByRole('button', { name: 'Change days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(databaseService.saveLibraryDays).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Change days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Saturday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sunday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save days' }));
    expect(databaseService.saveLibraryDays).toHaveBeenCalledWith('u1', { days: [0, 2, 6], since: '2026-11-11' });
    expect(bigCard().getAttribute('aria-label')).toMatch(/^Start Beginner Full Body B/);
    expect(smallCards()).toEqual(['Start Beginner Lower & Core']);
  });

  it('still works when the saved days can’t be read', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    databaseService.getLibraryDays.mockRejectedValueOnce(new Error('offline'));
    show({ logs: lastWeek });
    expect(await screen.findByText('Your week')).not.toBeNull();
    expect(smallCards()).toHaveLength(2);
  });

  it('previews the session: warm-up, a swap in a program done before, and a neglected-muscle finisher', async () => {
    mockLibrary({ gym: { beginner: realBeginner } });
    // 3+ sessions, upper body + quads only: hamstrings never trained.
    const row = (log_date, plan_name, exercise_name) => ({ log_date, plan_name, exercise_name, set_type: null });
    const logs = [
      row('2026-10-24', 'Beginner Lower & Core', 'Crunch'),
      row('2026-10-28', 'Beginner Full Body A', 'Goblet Squat'), row('2026-10-28', 'Beginner Full Body A', 'Push-up'),
      row('2026-11-01', 'Beginner Full Body B', 'Leg Press'), row('2026-11-01', 'Beginner Full Body B', 'Seated Row (Machine)'),
      row('2026-11-05', 'Beginner Full Body A', 'Dumbbell Row'), row('2026-11-09', 'Beginner Full Body B', 'Chest Press (Machine)')
    ];
    show({ logs });
    await screen.findByText('Your week');
    expect(bigCard().getAttribute('aria-label')).toMatch(/^Start Beginner Lower & Core — Warm-up, 1 new exercise, \w+ finisher/);
    expect(bigCard().querySelector('.wpc-stats').textContent).toMatch(/^\d+ min · \d+ exercises$/);
  });

  it('no swap for a program never done, and no finisher before 3 sessions', async () => {
    mockLibrary({ gym: { beginner: realBeginner } });
    show({ logs: [did('2026-11-02', 'Beginner Full Body A', { exercise_name: 'Goblet Squat' })] });
    await screen.findByText('Your week');
    const label = bigCard().getAttribute('aria-label');
    expect(label).toMatch(/^Start Beginner Lower & Core/);
    expect(label).not.toMatch(/new exercise|finisher/);
  });

  it('a client who chose a level but has never trained gets their week, not the picker', async () => {
    mockLibrary({ gym: { beginner: realBeginner } });
    databaseService.getLibraryLevelPref.mockResolvedValueOnce({ level: 'beginner', category: 'gym', since: null });
    databaseService.getLibraryDays.mockResolvedValueOnce({ days: [0, 2, 5], since: '2026-11-11' });
    show();
    expect(await screen.findByText('Your week')).not.toBeNull();
    expect(screen.queryByText('What’s your level?')).toBeNull();
    expect(bigCard().getAttribute('aria-label')).toBe('Start Beginner Full Body A — Warm-up');
  });

  it('hiding the week leaves a row that brings it back — never the level picker', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    const onNavigate = vi.fn();
    show({ logs: lastWeek, onNavigateToWorkouts: onNavigate });
    await screen.findByText('Your week');
    // No ✕ on this card: it swipes left to reveal a Hide action (SwipeToHide).
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hide this week' }));
    const row = await screen.findByRole('button', { name: /Show my week/ });
    expect(row.textContent).toContain('Beginner Lower & Core');
    expect(screen.queryByText('What’s your level?')).toBeNull();
    expect(localStorage.getItem('weekPlanHidden_u1')).toBe('2026-11-09');

    fireEvent.click(row);
    expect(screen.getByText('Your week')).not.toBeNull();
    expect(localStorage.getItem('weekPlanHidden_u1')).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('a hidden week stays hidden on the next app open, and is back next Monday', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    localStorage.setItem('weekPlanHidden_u1', '2026-11-09');
    const { unmount } = show({ logs: lastWeek });
    expect(await screen.findByRole('button', { name: /Show my week/ })).not.toBeNull();
    unmount();
    vi.setSystemTime(new Date('2026-11-16T08:00:00'));
    show({ logs: lastWeek });
    expect(await screen.findByText('Your week')).not.toBeNull();
  });

  it('never shows the level picker to a client who has logged a workout, named or not', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    const { unmount } = show({ logs: [did('2026-11-01', 'Coach Push Day')] });
    expect(await screen.findByText('Your week')).not.toBeNull();
    unmount();
    show({ logs: [{ log_date: '2026-11-01' }] });
    expect(await screen.findByText('Your week')).not.toBeNull();
    expect(screen.queryByText('What’s your level?')).toBeNull();
  });

  it('keeps showing guidance even with many sessions logged (no session-count cutoff)', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    show({ logs: Array.from({ length: 20 }, (_, i) => did(`2026-10-${String(i + 1).padStart(2, '0')}`, 'Beginner Full Body A')) });
    expect(await screen.findByText('Beginner · Gym')).not.toBeNull();
  });

  it('announces leveling up once ~3 months have passed since the first-ever session', async () => {
    mockLibrary({ gym: { beginner: gymBeginner, intermediate: [{ name: 'Intermediate Push', exercises: [] }] } });
    show({ logs: [did('2026-08-01', 'Beginner Full Body A')] });
    expect(await screen.findByText('Intermediate unlocked')).not.toBeNull();
    expect(bigCard().getAttribute('aria-label')).toMatch(/^Start Intermediate Push/);
  });

  it('a level that ends mid-week changes over on Monday, not halfway through', async () => {
    mockLibrary({ gym: { beginner: gymBeginner, intermediate: [{ name: 'Intermediate Push', exercises: [] }] } });
    // 12 weeks from 2026-08-19 is Wednesday 2026-11-11.
    databaseService.getLibraryLevelPref.mockResolvedValueOnce({ level: 'beginner', category: 'gym', since: '2026-08-19' });
    const { unmount } = show({ logs: lastWeek });
    expect(await screen.findByText('Beginner · Gym')).not.toBeNull();
    unmount();
    vi.setSystemTime(new Date('2026-11-16T08:00:00'));
    databaseService.getLibraryLevelPref.mockResolvedValueOnce({ level: 'beginner', category: 'gym', since: '2026-08-19' });
    show({ logs: lastWeek });
    expect(await screen.findByText('Intermediate unlocked')).not.toBeNull();
  });

  it('easy restart: says so, and starts with 2 sets each', async () => {
    mockLibrary({ gym: { beginner: realBeginner } });
    show({ logs: lastWeek, easyRestart: true });
    expect(await screen.findByText('Easy restart · 2 sets each')).not.toBeNull();
    fireEvent.click(bigCard());
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1')).exercises[0].sets).toBe(2);
  });

  it('deep-links into Home programs when that is where the client is active', async () => {
    mockLibrary({ gym: { beginner: gymBeginner }, home: { beginner: homeBeginner } });
    show({ logs: [did('2026-11-04', 'Home Beginner Full Body A')] });
    expect(await screen.findByText('Beginner · Home')).not.toBeNull();
    fireEvent.click(bigCard());
    expect(localStorage.getItem('workoutTrackerLastCategory_u1')).toBe('home');
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1')).name).toMatch(/^Home Beginner/);
  });
});
