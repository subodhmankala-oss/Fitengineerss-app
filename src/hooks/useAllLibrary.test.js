// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/databaseService', () => ({
  __esModule: true,
  default: {
    getGenericWorkoutsByLevel: vi.fn((level, category) =>
      level === 'advanced' && category === 'home'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve([{ id: `${category}-${level}`, name: `${category} ${level}` }])
    ),
  },
}));

import databaseService from '../services/databaseService';
import useAllLibrary from './useAllLibrary';

describe('useAllLibrary', () => {
  it('does nothing until enabled', () => {
    const { result } = renderHook(() => useAllLibrary(false));
    expect(result.current).toEqual({ entries: null, loading: false });
    expect(databaseService.getGenericWorkoutsByLevel).not.toHaveBeenCalled();
  });

  it('finishes loading (no stuck "Searching…") and loads only once', async () => {
    const { result, rerender } = renderHook(({ on }) => useAllLibrary(on), { initialProps: { on: true } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // 6 lists, one of which failed and is skipped.
    expect(result.current.entries).toHaveLength(5);
    expect(result.current.entries[0]).toMatchObject({ category: 'gym', level: 'beginner' });
    const calls = databaseService.getGenericWorkoutsByLevel.mock.calls.length;
    rerender({ on: false });
    rerender({ on: true });
    expect(databaseService.getGenericWorkoutsByLevel.mock.calls.length).toBe(calls);
  });
});
