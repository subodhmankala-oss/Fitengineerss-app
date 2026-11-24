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
// The one card on Home, and the sheet it opens.
const card = () => document.querySelector('.wpc-open');
const bars = () => [...document.querySelectorAll('.wpc-bar')].map(b => b.className.replace('wpc-bar', '').trim() || 'later');
const openSheet = async () => { await screen.findByRole('region', { name: 'Your workout week' }); fireEvent.click(card()); return screen.getByRole('dialog'); };
const dayTabs = () => [...document.querySelectorAll('.wws-day')].map(b => b.getAttribute('aria-label'));
const exerciseNames = () => [...document.querySelectorAll('.wws-ex-name')].map(e => e.textContent);
const tags = () => [...document.querySelectorAll('.wws-tag')].map(e => e.textContent);
const play = () => fireEvent.click(document.querySelector('.wpc-play'));

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

  it('"Make my plan" saves level, place and days and shows the one card, without starting anything', async () => {
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
    // Wednesday today: Wed, Fri, Sat are left this week.
    expect(document.querySelectorAll('.wpc-card')).toHaveLength(1);
    expect(card().textContent).toContain('Day 1 of 3');
    expect(card().textContent).toContain('Beginner Full Body A');
    expect(bars()).toEqual(['now', 'later', 'later']);
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
    play();
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
    expect(card().textContent).toContain('Intermediate Push');
    play();
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
    expect(bars()).toEqual(['done', 'now', 'later']);
    expect(card().textContent).toContain('Day 2 of 3');
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

  it('one card: today’s workout, with a bar per workout of the week', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    show({ logs: lastWeek }); // carries on after A: Mon B, Wed C, Sat A
    await screen.findByText('Day 2 of 3');
    expect(card().getAttribute('aria-label')).toMatch(/^See Beginner Lower & Core/);
    expect(bars()).toEqual(['later', 'now', 'later']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a saved workout’s bar turns green and the card moves on', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    show({ logs: [...lastWeek, did('2026-11-11', 'Beginner Lower & Core')] });
    await screen.findByText('Day 3 of 3');
    expect(bars()).toEqual(['later', 'done', 'now']);
  });

  it('play starts it straight away, without the sheet', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    const onNavigate = vi.fn();
    show({ logs: lastWeek, onNavigateToWorkouts: onNavigate });
    fireEvent.click(await screen.findByRole('button', { name: 'Start Beginner Lower & Core' }));
    expect(localStorage.getItem('workoutTrackerLastTab_u1')).toBe('templates');
    expect(localStorage.getItem('workoutTrackerLastLevel_u1')).toBe('beginner');
    expect(localStorage.getItem('workoutTrackerLastCategory_u1')).toBe('gym');
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'))).toMatchObject({ name: 'Beginner Lower & Core', level: 'beginner' });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('tapping the card opens the full workout and starts nothing', async () => {
    mockLibrary({ gym: { beginner: realBeginner } });
    const onNavigate = vi.fn();
    show({ logs: lastWeek, onNavigateToWorkouts: onNavigate });
    const sheet = await openSheet();
    expect(sheet.textContent).toContain('Wed 11 · Today');
    expect(sheet.textContent).toContain('Warm-up, about 5 min');
    expect(sheet.textContent).toContain('Beginner · Gym');
    expect(exerciseNames()).toEqual(['Dumbbell Squat', 'Glute Bridge', 'Calf Raise (Standing)', 'Crunch']);
    expect(document.querySelector('.wws-amount').textContent).toBe('3 × 10');
    expect(onNavigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('workoutTrackerAutoStart_u1')).toBeNull();
  });

  it('another day can be opened and started from the sheet', async () => {
    mockLibrary({ gym: { beginner: realBeginner } });
    const onNavigate = vi.fn();
    show({ logs: lastWeek, onNavigateToWorkouts: onNavigate });
    await openSheet();
    expect(dayTabs()).toEqual(['Monday, Beginner Full Body B', 'Wednesday, Beginner Lower & Core', 'Saturday, Beginner Full Body A']);
    fireEvent.click(screen.getByRole('button', { name: 'Saturday, Beginner Full Body A' }));
    expect(exerciseNames()[1]).not.toBe('Glute Bridge');
    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }));
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1')).name).toBe('Beginner Full Body A');
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a done day shows what was saved, and can’t be started again', async () => {
    mockLibrary({ gym: { beginner: realBeginner } });
    const set = (exercise_name, reps, set_type = null) => did('2026-11-10', 'Beginner Full Body B', { exercise_name, reps, set_type, calories_burned: 240 });
    show({ logs: [
      ...lastWeek, set('Arm Circle', 10, 'warmup'), set('Leg Press', 12), set('Leg Press', 12), set('Dead Bug', 10), set('Dead Bug', 8),
      did('2026-11-10', 'Coach Push Day', { exercise_name: 'Bench Press', reps: 5 })
    ] });
    const sheet = await openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Monday, Beginner Full Body B, done' }));
    expect(sheet.textContent).toContain('Done · 240 kcal');
    expect(exerciseNames()).toEqual(['Leg Press', 'Dead Bug']);
    expect([...document.querySelectorAll('.wws-amount')].map(e => e.textContent)).toEqual(['2 × 12', '2 sets']);
    expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
  });

  it('the sheet closes from outside, with Escape, or by dragging it down — not by a small nudge', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    show({ logs: lastWeek });
    await openSheet();
    fireEvent.click(document.querySelector('.wws-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await openSheet();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    await openSheet();
    const dragDown = (by) => {
      const at = (type, clientY) => fireEvent(document.querySelector('.wws-top'), new MouseEvent(type, { bubbles: true, clientY }));
      at('pointerdown', 100); at('pointermove', 100 + by); at('pointerup', 100 + by);
    };
    dragDown(40);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    dragDown(160);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a finished week says so and still offers the next workout', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    vi.setSystemTime(new Date('2026-11-14T12:00:00')); // Saturday
    const onNavigate = vi.fn();
    show({
      logs: [...lastWeek, did('2026-11-09', 'Beginner Full Body B'), did('2026-11-11', 'Beginner Lower & Core'), did('2026-11-14', 'Beginner Full Body A')],
      onNavigateToWorkouts: onNavigate
    });
    expect(await screen.findByText('Week done, 3 of 3')).not.toBeNull();
    expect(bars()).toEqual(['done', 'done', 'done']);
    await openSheet();
    expect(dayTabs()).toHaveLength(4);
    expect(screen.getByText('Next workout')).not.toBeNull();
    fireEvent.click(document.querySelector('.wws-backdrop'));
    fireEvent.click(screen.getByRole('button', { name: 'Start Beginner Full Body B' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('Change days saves the new days from today, and Cancel keeps the old ones', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    show({ logs: lastWeek });
    await openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Change days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(databaseService.saveLibraryDays).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Change days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Saturday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sunday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save days' }));
    expect(databaseService.saveLibraryDays).toHaveBeenCalledWith('u1', { days: [0, 2, 6], since: '2026-11-11' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(card().getAttribute('aria-label')).toMatch(/^See Beginner Full Body B/);
    expect(bars()).toEqual(['now', 'later']);
  });

  it('still works when the saved days can’t be read', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    databaseService.getLibraryDays.mockRejectedValueOnce(new Error('offline'));
    show({ logs: lastWeek });
    await screen.findByText('Day 2 of 3');
    expect(bars()).toHaveLength(3);
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
    await screen.findByRole('region', { name: 'Your workout week' });
    expect(card().getAttribute('aria-label')).toMatch(/^See Beginner Lower & Core — Warm-up, 1 new exercise, \w+ finisher/);
    expect(card().querySelector('.wpc-stats').textContent).toMatch(/^\d+ min · \d+ exercises · \d+ sets$/);
  });

  it('no swap for a program never done, and no finisher before 3 sessions', async () => {
    mockLibrary({ gym: { beginner: realBeginner } });
    show({ logs: [did('2026-11-02', 'Beginner Full Body A', { exercise_name: 'Goblet Squat' })] });
    await screen.findByRole('region', { name: 'Your workout week' });
    const label = card().getAttribute('aria-label');
    expect(label).toMatch(/^See Beginner Lower & Core/);
    expect(label).not.toMatch(/new exercise|finisher/);
  });

  it('a program twice in one week: the first time it is plain, the repeat shows its new exercise', async () => {
    mockLibrary({ gym: { beginner: realBeginner } });
    vi.setSystemTime(new Date('2026-11-09T12:00:00')); // Monday
    databaseService.getLibraryLevelPref.mockResolvedValueOnce({ level: 'beginner', category: 'gym', since: '2026-11-09' });
    databaseService.getLibraryDays.mockResolvedValueOnce({ days: [0, 2, 4, 5], since: '2026-11-09' });
    show();
    await screen.findByRole('region', { name: 'Your workout week' });
    await openSheet();
    expect(tags()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Saturday, Beginner Full Body A' }));
    expect(tags()).toHaveLength(1);
    expect(tags()[0]).toMatch(/^New, instead of /);
  });

  it('once the first is done, the repeat really starts with the new exercise — even the same day', async () => {
    mockLibrary({ gym: { beginner: realBeginner } });
    vi.setSystemTime(new Date('2026-11-09T12:00:00'));
    databaseService.getLibraryLevelPref.mockResolvedValueOnce({ level: 'beginner', category: 'gym', since: '2026-11-09' });
    databaseService.getLibraryDays.mockResolvedValueOnce({ days: [0, 2, 4, 5], since: '2026-11-09' });
    show({ logs: [did('2026-11-09', 'Beginner Full Body A', { exercise_name: 'Goblet Squat' })] });
    await openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Saturday, Beginner Full Body A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }));
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1')).priorRuns).toBe(1);
  });

  it('the sheet says what is new: the swapped exercise and the neglected muscle added', async () => {
    mockLibrary({ gym: { beginner: realBeginner } });
    const row = (log_date, plan_name, exercise_name) => ({ log_date, plan_name, exercise_name, set_type: null });
    show({ logs: [
      row('2026-10-24', 'Beginner Lower & Core', 'Crunch'), row('2026-10-28', 'Beginner Full Body A', 'Push-up'),
      row('2026-11-01', 'Beginner Full Body B', 'Seated Row (Machine)'), row('2026-11-09', 'Beginner Full Body B', 'Leg Press')
    ] });
    await screen.findByRole('region', { name: 'Your workout week' });
    await openSheet();
    expect(tags()).toHaveLength(2);
    expect(tags()[0]).toMatch(/^New, instead of /);
    expect(tags()[1]).toMatch(/^Added, .+ not trained/);
    // The neglected muscle is only promised for the one to do now.
    fireEvent.click(screen.getByRole('button', { name: /^Saturday/ }));
    expect(document.querySelectorAll('.wws-tag.added')).toHaveLength(0);
  });

  it('a client who chose a level but has never trained gets their week, not the picker', async () => {
    mockLibrary({ gym: { beginner: realBeginner } });
    databaseService.getLibraryLevelPref.mockResolvedValueOnce({ level: 'beginner', category: 'gym', since: null });
    databaseService.getLibraryDays.mockResolvedValueOnce({ days: [0, 2, 5], since: '2026-11-11' });
    show();
    expect(await screen.findByRole('region', { name: 'Your workout week' })).not.toBeNull();
    expect(screen.queryByText('What’s your level?')).toBeNull();
    expect(card().getAttribute('aria-label')).toBe('See Beginner Full Body A — Warm-up');
  });

  it('hiding the week leaves a row that brings it back — never the level picker', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    const onNavigate = vi.fn();
    show({ logs: lastWeek, onNavigateToWorkouts: onNavigate });
    await screen.findByRole('region', { name: 'Your workout week' });
    // No ✕ on this card: it swipes left to reveal a Hide action (SwipeToHide).
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hide this week' }));
    const row = await screen.findByRole('button', { name: /Show my week/ });
    expect(row.textContent).toContain('Beginner Lower & Core');
    expect(screen.queryByText('What’s your level?')).toBeNull();
    expect(localStorage.getItem('weekPlanHidden_u1')).toBe('2026-11-09');

    fireEvent.click(row);
    expect(screen.getByRole('region', { name: 'Your workout week' })).not.toBeNull();
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
    expect(await screen.findByRole('region', { name: 'Your workout week' })).not.toBeNull();
  });

  it('never shows the level picker to a client who has logged a workout, named or not', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    const { unmount } = show({ logs: [did('2026-11-01', 'Coach Push Day')] });
    expect(await screen.findByRole('region', { name: 'Your workout week' })).not.toBeNull();
    unmount();
    show({ logs: [{ log_date: '2026-11-01' }] });
    expect(await screen.findByRole('region', { name: 'Your workout week' })).not.toBeNull();
    expect(screen.queryByText('What’s your level?')).toBeNull();
  });

  it('keeps showing guidance even with many sessions logged (no session-count cutoff)', async () => {
    mockLibrary({ gym: { beginner: gymBeginner } });
    show({ logs: Array.from({ length: 20 }, (_, i) => did(`2026-10-${String(i + 1).padStart(2, '0')}`, 'Beginner Full Body A')) });
    await screen.findByRole('region', { name: 'Your workout week' });
    expect(card().textContent).toContain('Beginner');
  });

  it('announces leveling up once ~3 months have passed since the first-ever session', async () => {
    mockLibrary({ gym: { beginner: gymBeginner, intermediate: [{ name: 'Intermediate Push', exercises: [] }] } });
    show({ logs: [did('2026-08-01', 'Beginner Full Body A')] });
    expect(await screen.findByText('Intermediate unlocked')).not.toBeNull();
    expect(card().getAttribute('aria-label')).toMatch(/^See Intermediate Push/);
  });

  it('a level that ends mid-week changes over on Monday, not halfway through', async () => {
    mockLibrary({ gym: { beginner: gymBeginner, intermediate: [{ name: 'Intermediate Push', exercises: [] }] } });
    // 12 weeks from 2026-08-19 is Wednesday 2026-11-11.
    databaseService.getLibraryLevelPref.mockResolvedValueOnce({ level: 'beginner', category: 'gym', since: '2026-08-19' });
    const { unmount } = show({ logs: lastWeek });
    expect(await screen.findByText('Day 2 of 3')).not.toBeNull();
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
    play();
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1')).exercises[0].sets).toBe(2);
  });

  it('deep-links into Home programs when that is where the client is active', async () => {
    mockLibrary({ gym: { beginner: gymBeginner }, home: { beginner: homeBeginner } });
    show({ logs: [did('2026-11-04', 'Home Beginner Full Body A')] });
    await screen.findByRole('region', { name: 'Your workout week' });
    play();
    expect(localStorage.getItem('workoutTrackerLastCategory_u1')).toBe('home');
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1')).name).toMatch(/^Home Beginner/);
  });
});
