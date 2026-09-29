// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveTick } from './useLiveTick';

let visibility = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLiveTick', () => {
  it('ticks on its interval while active', () => {
    const { result } = renderHook(() => useLiveTick(true, 1000));
    expect(result.current).toBe(0);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current).toBe(3);
  });

  it('redraws at once when the app comes back on screen, without waiting for a tick', () => {
    const { result } = renderHook(() => useLiveTick(true, 1000));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current).toBe(1);
    act(() => { window.dispatchEvent(new Event('pageshow')); });
    expect(result.current).toBe(2);
  });

  it('does nothing when the app is going off screen', () => {
    const { result } = renderHook(() => useLiveTick(true, 1000));
    visibility = 'hidden';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current).toBe(0);
  });

  it('does nothing while inactive', () => {
    const { result } = renderHook(() => useLiveTick(false, 1000));
    act(() => {
      vi.advanceTimersByTime(5000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(0);
  });

  it('restarts the interval on return instead of stacking a second one', () => {
    const { result } = renderHook(() => useLiveTick(true, 1000));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(2);
  });
});
