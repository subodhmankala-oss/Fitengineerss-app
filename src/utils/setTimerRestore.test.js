import { describe, it, expect, afterEach } from 'vitest';
import { keepSetTimersForSameExercises, restoreSavedSetTimers, readSavedSetTimers } from './setTimerRestore';

const running = { isRunning: true, startedAt: 1_000, pausedDuration: 0 };
const paused = { isRunning: false, startedAt: null, pausedDuration: 95 };
const ex = (name, sets = [{ isCompleted: false }, { isCompleted: false }]) => ({ name, sets });

describe('keepSetTimersForSameExercises', () => {
  it('keeps a stopwatch whose exercise is still at the same position', () => {
    const exercises = [ex('Squat'), ex('Treadmill Walk')];
    expect(keepSetTimersForSameExercises({ '1,0': running, '1,1': paused }, exercises, exercises))
      .toEqual({ '1,0': running, '1,1': paused });
  });

  it('accepts the names the timers were keyed against instead of exercise objects', () => {
    expect(keepSetTimersForSameExercises({ '1,0': running }, ['Squat', 'Plank'], [ex('Squat'), ex('Plank')]))
      .toEqual({ '1,0': running });
  });

  it('never moves a stopwatch onto a different exercise', () => {
    // Treadmill Walk was reordered away; Plank now sits at index 1
    expect(keepSetTimersForSameExercises({ '1,0': running }, ['Squat', 'Treadmill Walk'], [ex('Squat'), ex('Plank')]))
      .toEqual({});
  });

  it('drops a stopwatch whose set is gone or already ticked off', () => {
    const to = [ex('Plank', [{ isCompleted: true }])];
    expect(keepSetTimersForSameExercises({ '0,0': running, '0,3': paused }, ['Plank'], to)).toEqual({});
  });

  it('returns nothing for missing input', () => {
    expect(keepSetTimersForSameExercises(null, [], [])).toEqual({});
    expect(keepSetTimersForSameExercises({ '0,0': running }, undefined, undefined)).toEqual({});
  });
});

describe('restoreSavedSetTimers', () => {
  const saved = { sessionStartedAt: 1_790_000_000_000, timers: { '0,0': running }, names: ['Treadmill Walk'] };

  it('restores into the same session', () => {
    expect(restoreSavedSetTimers(saved, 1_790_000_000_000, [ex('Treadmill Walk')])).toEqual({ '0,0': running });
  });

  it('never restores into a different session with the same exercises', () => {
    expect(restoreSavedSetTimers(saved, 1_790_000_999_999, [ex('Treadmill Walk')])).toEqual({});
  });

  it('returns nothing when there is no saved entry', () => {
    expect(restoreSavedSetTimers(null, 1, [ex('Plank')])).toEqual({});
  });
});

describe('readSavedSetTimers', () => {
  afterEach(() => localStorage.clear());

  it('reads a saved entry', () => {
    localStorage.setItem('k', JSON.stringify({ sessionStartedAt: 5, timers: { '0,0': paused }, names: ['Plank'] }));
    expect(readSavedSetTimers('k')).toEqual({ sessionStartedAt: 5, timers: { '0,0': paused }, names: ['Plank'] });
  });

  it('ignores missing, malformed or wrongly shaped entries', () => {
    expect(readSavedSetTimers('k')).toBeNull();
    localStorage.setItem('k', '{not json');
    expect(readSavedSetTimers('k')).toBeNull();
    localStorage.setItem('k', JSON.stringify({ timers: { '0,0': paused } }));
    expect(readSavedSetTimers('k')).toBeNull();
  });
});
