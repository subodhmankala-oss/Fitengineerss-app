import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useFocusExercise, { isFocusActive, focusSummary } from './useFocusExercise';

const set = (done) => ({ reps: '10', weight: '20', isCompleted: done });

describe('useFocusExercise', () => {
  it('focuses the ticked exercise and stays until expanded', () => {
    const { result } = renderHook(() => useFocusExercise());
    expect(isFocusActive(result.current, ['a', 'b'], false)).toBe(false);
    act(() => result.current.onSetTicked('a', true));
    expect(isFocusActive(result.current, ['a', 'b'], false)).toBe(true);
    act(() => result.current.expand());
    expect(isFocusActive(result.current, ['a', 'b'], false)).toBe(false);
    // Ticking on another card after expanding focuses that one.
    act(() => result.current.onSetTicked('b', true));
    expect(result.current.focusKey).toBe('b');
    expect(isFocusActive(result.current, ['a', 'b'], false)).toBe(true);
  });

  it('ignores un-ticks, reorders and removed cards', () => {
    const { result } = renderHook(() => useFocusExercise());
    act(() => result.current.onSetTicked('a', false));
    expect(result.current.focusKey).toBe(null);
    act(() => result.current.onSetTicked('a', true));
    expect(isFocusActive(result.current, ['a'], true)).toBe(false);
    expect(isFocusActive(result.current, ['b'], false)).toBe(false);
  });
});

describe('focusSummary', () => {
  it('names the next unfinished exercise and skips warm-ups', () => {
    const list = [
      { name: 'Arm Circle', sets: [{ ...set(false), isWarmup: true, setType: 'warmup' }] },
      { name: 'Bench Press', sets: [set(true)] },
      { name: 'Squat', sets: [set(true), set(true)] },
      { name: 'Row', sets: [set(false)] },
    ];
    expect(focusSummary(list, 1)).toEqual({ hiddenCount: 2, nextName: 'Row' });
    expect(focusSummary(list, 3)).toEqual({ hiddenCount: 2, nextName: null });
  });
});
