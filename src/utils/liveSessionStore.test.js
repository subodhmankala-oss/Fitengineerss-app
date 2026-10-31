// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tickedSetRows, publishLiveRows, readLiveRows, LIVE_ROWS_EVENT } from './liveSessionStore';
import { getWeeklyMuscleStats } from './muscleAnalytics';

const set = (overrides) => ({ weight: '40', reps: '10', isCompleted: true, completedAt: 1000, ...overrides });

describe('tickedSetRows', () => {
  it('turns only ticked sets into workout_logs-shaped rows', () => {
    const rows = tickedSetRows([
      { name: 'Bench Press', sets: [set(), set({ isCompleted: false }), set({ weight: '42.5', reps: '8' })] },
    ], '2026-10-31');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ log_date: '2026-10-31', exercise_name: 'Bench Press', weight_kg: 42.5, reps: 8, set_number: 3, set_type: 'normal' });
  });

  it('marks warm-up sets so Muscle Balance skips them', () => {
    const rows = tickedSetRows([{ name: 'Bench Press', sets: [set({ isWarmup: true }), set()] }], '2026-10-31');
    expect(rows.map(r => r.set_type)).toEqual(['warmup', 'normal']);
    const chest = getWeeklyMuscleStats(rows, '2026-10-26', '2026-11-01').find(s => s.muscle === 'Chest');
    expect(chest.sets).toBe(1);
  });
});

describe('publishLiveRows / readLiveRows', () => {
  beforeEach(() => localStorage.clear());

  it('hands rows to the same account only', () => {
    const rows = tickedSetRows([{ name: 'Bench Press', sets: [set()] }], '2026-10-31');
    publishLiveRows('user-a', rows);
    expect(readLiveRows('user-a')).toEqual(rows);
    expect(readLiveRows('user-b')).toEqual([]);
  });

  it('clears when there is nothing ticked, and announces every change', () => {
    const listener = vi.fn();
    window.addEventListener(LIVE_ROWS_EVENT, listener);
    publishLiveRows('user-a', tickedSetRows([{ name: 'Bench Press', sets: [set()] }], '2026-10-31'));
    publishLiveRows('user-a', []);
    expect(readLiveRows('user-a')).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(LIVE_ROWS_EVENT, listener);
  });
});
