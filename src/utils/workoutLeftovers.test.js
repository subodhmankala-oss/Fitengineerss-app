// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The server copy (workout_leftovers), one row per client.
const remote = new Map();
let remoteUp = true;
vi.mock('../services/databaseService', () => ({
  __esModule: true,
  default: {
    getWorkoutLeftoversRemote: vi.fn(async (id) => (remoteUp ? (remote.get(id) || []) : null)),
    saveWorkoutLeftoversRemote: vi.fn(async (id, items) => {
      if (!remoteUp) return false;
      remote.set(id, items);
      return true;
    })
  }
}));

import { findSkippedExercises, getWorkoutLeftovers, updateWorkoutLeftovers, clearWorkoutLeftovers, syncWorkoutLeftovers, LEFTOVER_TTL_DAYS } from './workoutLeftovers';

const DAY = 24 * 60 * 60 * 1000;
const set = (done) => ({ reps: '10', weight: '20', isCompleted: done });

describe('findSkippedExercises', () => {
  it('returns only exercises with no ticked set', () => {
    const exercises = [
      { name: 'Bench Press', sets: [set(true), set(true)] },
      { name: 'Incline Press', sets: [set(true), set(false)] },
      { name: 'Cable Fly', sets: [set(false), set(false)] },
      { name: 'Tricep Pushdown', sets: [set(false)] },
    ];
    expect(findSkippedExercises(exercises)).toEqual(['Cable Fly', 'Tricep Pushdown']);
  });

  it('ignores warm-up moves and exercises with no sets', () => {
    const exercises = [
      { name: 'Arm Circle', sets: [set(false)] },
      { name: 'Band Pull Apart', sets: [{ reps: '15', isWarmup: true, isCompleted: false }] },
      { name: 'Leg Curl', sets: [] },
      { name: 'Calf Raise', sets: [set(false)] },
    ];
    expect(findSkippedExercises(exercises)).toEqual(['Calf Raise']);
  });
});

describe('workout leftovers storage', () => {
  beforeEach(() => { localStorage.clear(); remote.clear(); remoteUp = true; });

  it('stores skipped exercises per client', () => {
    updateWorkoutLeftovers('u1', { skipped: ['Leg Curl', 'Calf Raise'], date: '2026-10-12', planName: 'Leg Day' }, 1000);
    expect(getWorkoutLeftovers('u1', 2000)).toEqual([
      { name: 'Leg Curl', date: '2026-10-12', planName: 'Leg Day', savedAt: 1000 },
      { name: 'Calf Raise', date: '2026-10-12', planName: 'Leg Day', savedAt: 1000 },
    ]);
    expect(getWorkoutLeftovers('u2', 2000)).toEqual([]);
  });

  it('clears leftovers done in a later workout and keeps the rest', () => {
    updateWorkoutLeftovers('u1', { skipped: ['Leg Curl', 'Calf Raise'], date: '2026-10-12' }, 1000);
    updateWorkoutLeftovers('u1', { skipped: ['Face Pull'], completed: ['leg curl', 'Row'], date: '2026-10-13' }, 2000);
    expect(getWorkoutLeftovers('u1', 3000).map(it => [it.name, it.date])).toEqual([
      ['Calf Raise', '2026-10-12'],
      ['Face Pull', '2026-10-13'],
    ]);
  });

  it('skipped again replaces the older entry instead of duplicating it', () => {
    updateWorkoutLeftovers('u1', { skipped: ['Leg Curl'], date: '2026-10-12' }, 1000);
    updateWorkoutLeftovers('u1', { skipped: ['Leg Curl', 'Leg Curl'], date: '2026-10-13' }, 2000);
    expect(getWorkoutLeftovers('u1', 3000)).toEqual([{ name: 'Leg Curl', date: '2026-10-13', planName: null, savedAt: 2000 }]);
  });

  it(`expires entries after ${LEFTOVER_TTL_DAYS} days`, () => {
    updateWorkoutLeftovers('u1', { skipped: ['Leg Curl'] }, 0);
    expect(getWorkoutLeftovers('u1', LEFTOVER_TTL_DAYS * DAY - 1)).toHaveLength(1);
    expect(getWorkoutLeftovers('u1', LEFTOVER_TTL_DAYS * DAY)).toEqual([]);
    expect(localStorage.getItem('workoutLeftovers_u1')).toBeNull();
  });

  it('clears some or all', () => {
    updateWorkoutLeftovers('u1', { skipped: ['Leg Curl', 'Calf Raise'] });
    clearWorkoutLeftovers('u1', ['calf raise']);
    expect(getWorkoutLeftovers('u1').map(it => it.name)).toEqual(['Leg Curl']);
    clearWorkoutLeftovers('u1');
    expect(getWorkoutLeftovers('u1')).toEqual([]);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('workoutLeftovers_u1', '{not json');
    expect(getWorkoutLeftovers('u1')).toEqual([]);
  });

  it('reach the server, so another phone (or after a sign-out wipe) sees them', async () => {
    const now = Date.now();
    await updateWorkoutLeftovers('u1', { skipped: ['Reverse Fly', 'Cable Shrug'], date: '2026-11-09' }, now);
    expect(remote.get('u1').map(it => it.name)).toEqual(['Reverse Fly', 'Cable Shrug']);

    localStorage.clear(); // a different phone, or storage wiped on sign-out
    expect(getWorkoutLeftovers('u1')).toEqual([]);
    await syncWorkoutLeftovers('u1');
    expect(getWorkoutLeftovers('u1').map(it => it.name)).toEqual(['Reverse Fly', 'Cable Shrug']);
  });

  it('adding or dismissing on one phone clears it everywhere', async () => {
    await updateWorkoutLeftovers('u1', { skipped: ['Reverse Fly', 'Cable Shrug'] });
    await clearWorkoutLeftovers('u1', ['reverse fly']);
    expect(remote.get('u1').map(it => it.name)).toEqual(['Cable Shrug']);
    await clearWorkoutLeftovers('u1');
    expect(remote.get('u1')).toEqual([]);
  });

  it('keeps the phone copy when the server is unreachable, and sends it later', async () => {
    remoteUp = false;
    await updateWorkoutLeftovers('u1', { skipped: ['Face Pull'] });
    await syncWorkoutLeftovers('u1');
    expect(getWorkoutLeftovers('u1').map(it => it.name)).toEqual(['Face Pull']);

    remoteUp = true;
    remote.set('u1', []); // older server copy must not win over the unsent change
    await syncWorkoutLeftovers('u1');
    expect(remote.get('u1').map(it => it.name)).toEqual(['Face Pull']);
    expect(getWorkoutLeftovers('u1').map(it => it.name)).toEqual(['Face Pull']);
  });
});
