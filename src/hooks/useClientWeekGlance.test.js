import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { getLocalDateString } from '../utils/dateUtils';

const fetchRows = vi.fn();
vi.mock('../services/databaseService', () => ({
  default: { getRecentWorkoutRowsForClients: (...args) => fetchRows(...args) },
}));

const { useClientWeekGlance } = await import('./useClientWeekGlance');

const old = '2026-01-01T00:00:00Z'; // not a new signup
const clients = [
  { id: 'a', joined_at: old },
  { id: 'b', joined_at: old },
];

beforeEach(() => fetchRows.mockReset());
afterEach(cleanup);

describe('useClientWeekGlance', () => {
  it('does not reuse the empty first result for the real client list', async () => {
    let resolve;
    fetchRows.mockReturnValue(new Promise(r => { resolve = r; }));
    const { result, rerender } = renderHook(({ list }) => useClientWeekGlance(list), { initialProps: { list: [] } });
    await waitFor(() => expect(result.current.glances).toEqual({}));

    // Clients arrive; their fetch is still running → loading, not "30+ days".
    rerender({ list: clients });
    expect(result.current.glances).toBeNull();

    resolve([{ user_id: 'a', log_date: getLocalDateString(), plan_name: 'Push' }]);
    await waitFor(() => expect(result.current.glances).not.toBeNull());
    expect(result.current.glances.a.needsYou).toBe(false);
    expect(result.current.glances.a.label).toBe('Trained today');
    expect(result.current.glances.b.needsYou).toBe(true);
  });

  it('a failed fetch marks nobody as "needs you"', async () => {
    fetchRows.mockResolvedValue(null);
    const { result } = renderHook(() => useClientWeekGlance(clients));
    await waitFor(() => expect(result.current.glances).toEqual({}));
  });
});
