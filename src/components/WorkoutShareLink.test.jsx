import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const { workoutShare } = vi.hoisted(() => ({ workoutShare: vi.fn() }));
vi.mock('../services/databaseService', () => ({ default: { workoutShare } }));

import WorkoutShareLinkSheet from './WorkoutShareLinkSheet';
import SharedWorkoutPage from './SharedWorkoutPage';
import { SHARE_TOKEN_RE, firstNameOf, newShareToken, sharedWorkoutMuscles, sharedWorkoutTotals, shareMessage, shareTokenFromPath } from '../utils/workoutShare';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const TOKEN = 'A'.repeat(22);
const LIVE = { token: TOKEN, logDate: '2026-11-23', showName: true, showMap: true, showWeights: false, showCalories: true };
const WORKOUT = { title: 'Push Day', logDate: '2026-11-23', sets: 15, durationSeconds: 3120 };

describe('link helpers', () => {
  it('makes unguessable tokens', () => {
    expect(newShareToken()).toMatch(SHARE_TOKEN_RE);
    expect(newShareToken()).not.toBe(newShareToken());
  });
  it('reads the token from the address', () => {
    expect(shareTokenFromPath(`/w/${TOKEN}`)).toBe(TOKEN);
    expect(shareTokenFromPath('/w/oops')).toBe('');
    expect(shareTokenFromPath('/')).toBeNull();
    expect(shareTokenFromPath('/workouts')).toBeNull();
  });
  it('uses the first name only, never the placeholder', () => {
    expect(firstNameOf('Rahul Sharma')).toBe('Rahul');
    expect(firstNameOf('Warrior')).toBeNull();
    expect(firstNameOf('rahul@example.com')).toBeNull();
  });
  it('writes the message', () => {
    expect(shareMessage({ ...WORKOUT, url: 'https://x/w/1' })).toBe('My Push Day workout: 15 sets, 52 min\nhttps://x/w/1');
  });
});

describe('Share sheet', () => {
  beforeEach(() => { workoutShare.mockReset(); });

  it('makes no link until it is sent, then saves the same one WhatsApp got', async () => {
    workoutShare.mockResolvedValue({ shares: [] });
    render(<WorkoutShareLinkSheet workout={WORKOUT} onClose={() => {}} />);
    const wa = screen.getByText('WhatsApp').closest('a');
    await waitFor(() => expect(wa.getAttribute('href')).toBeTruthy());
    expect(workoutShare.mock.calls).toEqual([['list']]);
    const sent = decodeURIComponent(wa.getAttribute('href')).match(/\/w\/(\S+)/)[1];
    fireEvent.click(wa);
    await waitFor(() => expect(workoutShare).toHaveBeenCalledTimes(2));
    expect(workoutShare.mock.calls[1]).toEqual(['save', expect.objectContaining({ token: sent, logDate: '2026-11-23' })]);
  });

  it('changes what a live link shows', async () => {
    workoutShare.mockResolvedValue({ shares: [LIVE] });
    render(<WorkoutShareLinkSheet workout={WORKOUT} onClose={() => {}} />);
    await screen.findByText('Link is on');
    expect(screen.getByRole('switch', { name: 'Show weights' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('switch', { name: 'Show muscle map' }));
    expect(workoutShare).toHaveBeenLastCalledWith('flags', expect.objectContaining({ flags: expect.objectContaining({ showMap: false, showWeights: false }) }));
  });

  it('stopping kills the link: sharing again makes a new one', async () => {
    workoutShare.mockImplementation(async (op) => ({ shares: op === 'list' ? [LIVE] : [] }));
    render(<WorkoutShareLinkSheet workout={WORKOUT} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Stop sharing' }));
    await screen.findByText('Sharing stopped');
    expect(screen.queryByText('Link is on')).toBeNull();
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).not.toContain(TOKEN);
  });

  it('says so when the link could not be turned on', async () => {
    workoutShare.mockImplementation(async (op) => {
      if (op === 'list') return { shares: [] };
      throw new Error("Couldn't update sharing. Try again.");
    });
    render(<WorkoutShareLinkSheet workout={WORKOUT} onClose={() => {}} />);
    const copy = screen.getByRole('button', { name: 'Copy link' });
    await waitFor(() => expect(copy.disabled).toBe(false));
    fireEvent.click(copy);
    expect((await screen.findByRole('alert')).textContent).toContain("Couldn't update sharing");
    expect(screen.queryByText('Link copied')).toBeNull();
  });
});

const PUBLIC = {
  title: 'Push Day', date: '2026-11-23', name: 'Rahul', durationSeconds: 3120, calories: 320,
  showMap: true, showWeights: true, bodySex: 'male',
  exercises: [
    { name: 'Barbell Bench Press', newBest: true, sets: [{ reps: 12, weightKg: 20, type: 'warmup' }, { reps: 10, weightKg: 60, type: null }, { reps: 8, weightKg: 65, type: null }] },
    { name: 'Triceps Pushdown', sets: [{ reps: 12, weightKg: 25, type: null }] },
  ],
};
const hidden = {
  ...PUBLIC, name: null, calories: null, showWeights: false,
  exercises: PUBLIC.exercises.map(({ newBest: _n, ...ex }) => ({ ...ex, sets: ex.sets.map(({ weightKg, ...s }) => ({ ...s, loaded: weightKg > 0 })) })),
};

describe('shared workout totals', () => {
  it('counts working sets and muscles the same with weights hidden', () => {
    expect(sharedWorkoutTotals(PUBLIC)).toEqual({ sets: 3, volume: 60 * 10 + 65 * 8 + 25 * 12 });
    expect(sharedWorkoutTotals(hidden)).toEqual({ sets: 3, volume: null });
    expect(sharedWorkoutMuscles(hidden)).toEqual(sharedWorkoutMuscles(PUBLIC));
    expect(sharedWorkoutMuscles(PUBLIC)[0]).toMatchObject({ muscle: 'Chest', main: true });
  });
});

describe('Shared workout page', () => {
  const serve = (status, body) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 300, status, json: async () => body })));

  it('shows the workout with nothing to type, tick or press', async () => {
    serve(200, { workout: PUBLIC });
    const { container } = render(<SharedWorkoutPage token={TOKEN} />);
    await screen.findByRole('heading', { name: 'Push Day' });
    expect(screen.getByText('View only')).toBeTruthy();
    expect(screen.getByText('Muscles worked')).toBeTruthy();
    expect(screen.getByText('60 kg')).toBeTruthy();
    expect(screen.getByText('New best')).toBeTruthy();
    expect(container.querySelectorAll('input, button, textarea, select, [contenteditable]')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Try it' })).toBeTruthy();
  });

  it('hides weights and the map when they were switched off', async () => {
    serve(200, { workout: { ...hidden, showMap: false } });
    const { container } = render(<SharedWorkoutPage token={TOKEN} />);
    await screen.findByRole('heading', { name: 'Push Day' });
    expect(container.textContent).not.toMatch(/kg|kcal|Rahul|Muscles worked/);
    expect(screen.getAllByText('10 reps')).toHaveLength(1);
  });

  it('stays view only for someone signed in to the app', async () => {
    localStorage.setItem('onboardingComplete', 'true');
    serve(200, { workout: PUBLIC });
    const { container } = render(<SharedWorkoutPage token={TOKEN} />);
    expect(await screen.findByRole('link', { name: 'My workouts' })).toBeTruthy();
    expect(container.querySelectorAll('input, button')).toHaveLength(0);
  });

  it('says when the link is off', async () => {
    serve(404, { error: 'gone' });
    render(<SharedWorkoutPage token={TOKEN} />);
    expect(await screen.findByText('This workout isn’t shared anymore')).toBeTruthy();
  });

  it('a broken link asks the server nothing', () => {
    serve(200, {});
    render(<SharedWorkoutPage token="" />);
    expect(screen.getByText('This workout isn’t shared anymore')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
});
