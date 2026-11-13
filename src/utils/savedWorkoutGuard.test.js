import { describe, it, expect, beforeEach } from 'vitest';
import { finishedSessionId, rememberSavedWorkout, wasWorkoutSaved } from './savedWorkoutGuard';

describe('finishedSessionId', () => {
  it('gives every save of one workout the same id', () => {
    const start = 1794540000000;
    expect(finishedSessionId('session', start, 1794545238437)).toBe('session-1794540000000');
    expect(finishedSessionId('session', start, 1794545935569)).toBe('session-1794540000000');
    expect(finishedSessionId('coach-live', String(start))).toBe('coach-live-1794540000000');
  });

  it('falls back to now when the clock never started', () => {
    expect(finishedSessionId('session', null, 42)).toBe('session-42');
    expect(finishedSessionId('session', 0, 42)).toBe('session-42');
  });
});

describe('rememberSavedWorkout / wasWorkoutSaved', () => {
  beforeEach(() => localStorage.clear());

  it('remembers a saved workout by scope and clock start', () => {
    rememberSavedWorkout('self', 1000);
    expect(wasWorkoutSaved('self', 1000)).toBe(true);
    expect(wasWorkoutSaved('self', '1000')).toBe(true);
    expect(wasWorkoutSaved('self', 2000)).toBe(false);
    expect(wasWorkoutSaved('coach:abc', 1000)).toBe(false);
  });

  it('ignores a workout with no clock start', () => {
    rememberSavedWorkout('self', null);
    expect(wasWorkoutSaved('self', null)).toBe(false);
    expect(localStorage.getItem('savedWorkoutStarts')).toBeNull();
  });

  it('keeps only the most recent 20', () => {
    for (let i = 1; i <= 25; i++) rememberSavedWorkout('self', i);
    expect(wasWorkoutSaved('self', 1)).toBe(false);
    expect(wasWorkoutSaved('self', 25)).toBe(true);
    expect(JSON.parse(localStorage.getItem('savedWorkoutStarts'))).toHaveLength(20);
  });

  it('survives unreadable storage', () => {
    localStorage.setItem('savedWorkoutStarts', '{not json');
    expect(wasWorkoutSaved('self', 1)).toBe(false);
    rememberSavedWorkout('self', 1);
    expect(wasWorkoutSaved('self', 1)).toBe(true);
  });
});
