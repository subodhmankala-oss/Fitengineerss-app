import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseDeepLink, stashDeepLink, takeInitialDeepLink, tabForDeepLink } from './deepLink';

describe('parseDeepLink', () => {
  it('returns null when there are no deep-link params', () => {
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink('?utm_source=x')).toBeNull();
  });

  it('picks out the deep-link params', () => {
    expect(parseDeepLink('?viewClient=abc&clientTab=measurements&utm=1')).toEqual({ viewClient: 'abc', clientTab: 'measurements' });
    expect(parseDeepLink('?openMuscleMap=1&section=heatmap')).toEqual({ openMuscleMap: '1', section: 'heatmap' });
  });
});

describe('tabForDeepLink', () => {
  it('maps each link to the client tab it lands on', () => {
    expect(tabForDeepLink(null)).toBeNull();
    expect(tabForDeepLink({ openMeasurements: '1' })).toBe('profile');
    expect(tabForDeepLink({ openMuscleMap: '1' })).toBe('home');
    expect(tabForDeepLink({ openMonthlyReport: '1' })).toBe('home');
    expect(tabForDeepLink({ tab: 'workouts' })).toBe('workouts');
    expect(tabForDeepLink({ tab: 'nonsense' })).toBeNull();
    expect(tabForDeepLink({ viewClient: 'abc' })).toBeNull();
  });
});

describe('takeInitialDeepLink', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.useRealTimers();
  });

  it('reads the URL, cleans the address bar, and stashes the link', () => {
    window.history.replaceState(null, '', '/?viewClient=abc&clientTab=workout');
    expect(takeInitialDeepLink()).toEqual({ viewClient: 'abc', clientTab: 'workout' });
    expect(window.location.search).toBe('');
    // A reload right after the tap (plain URL now) still gets the link.
    expect(takeInitialDeepLink()).toEqual({ viewClient: 'abc', clientTab: 'workout' });
  });

  it('ignores a stashed link once it is stale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    stashDeepLink({ tab: 'workouts' });
    vi.setSystemTime(new Date('2026-09-24T10:05:00Z'));
    expect(takeInitialDeepLink()).toBeNull();
    vi.useRealTimers();
  });
});
