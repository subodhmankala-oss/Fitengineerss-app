// @vitest-environment jsdom
//
// Regression tests for a workout being written to workout_logs TWICE
// (confirmed 2026-09-14: 12 rows at 07:46:19 and the same 12 again at
// 07:46:21 for one "Beginner Full Body A" session). Duplicated rows
// double-count that session's volume and set totals in every analytics read
// that sums rows.
//
// Two independent paths produced the duplicate, both covered here:
//   1. A failing save is retried once by the caller, and BOTH attempts parked
//      the same rows in the pending-retry queue — which then replayed both.
//   2. flushPendingWorkoutLogs() has two triggers (the browser `online` event
//      and "a session is now available"). Fired together — exactly what
//      happens when connectivity returns as the session is re-established —
//      each read the same queue and replayed it before either wrote the
//      shortened queue back.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { setSession: vi.fn() }, from: vi.fn(), rpc: vi.fn() })),
}));

const PENDING_LOGS_KEY = 'pendingWorkoutLogs';

const recordsFor = (planName) => ([
  { user_id: 'u1', log_date: '2026-09-14', exercise_name: 'Goblet Squat', set_number: 1, reps: 12, weight_kg: 0, plan_name: planName },
  { user_id: 'u1', log_date: '2026-09-14', exercise_name: 'Goblet Squat', set_number: 2, reps: 12, weight_kg: 0, plan_name: planName },
]);

const queueContents = () => JSON.parse(localStorage.getItem(PENDING_LOGS_KEY) || '[]');

describe('pending workout-log queue', () => {
  let flushPendingWorkoutLogs;
  let serverSaveCalls;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    serverSaveCalls = [];

    global.fetch = vi.fn(async (url, opts) => {
      if (String(url).includes('/api/save-workout-session')) {
        serverSaveCalls.push(JSON.parse(opts?.body || '{}'));
        return { ok: true, status: 200, json: async () => ({ saved: true }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    ({ flushPendingWorkoutLogs } = await import('./databaseService'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replays each queued session exactly once', async () => {
    localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify([
      { records: recordsFor('Beginner Full Body A'), queuedAt: '2026-09-14T07:46:00.000Z' },
    ]));

    const result = await flushPendingWorkoutLogs();

    expect(serverSaveCalls).toHaveLength(1);
    expect(result.saved).toBe(1);
    expect(localStorage.getItem(PENDING_LOGS_KEY)).toBeNull();
  });

  // Path 1's leftovers: a queue written by a build from before the fix can
  // already hold the same session twice. Draining it must not write the sets
  // twice.
  it('replays a session only once even if it was parked twice by an older build', async () => {
    const records = recordsFor('Beginner Full Body A');
    localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify([
      { records, queuedAt: '2026-09-14T07:46:00.000Z' },
      { records, queuedAt: '2026-09-14T07:46:02.000Z' },
    ]));

    await flushPendingWorkoutLogs();

    expect(serverSaveCalls).toHaveLength(1);
    expect(localStorage.getItem(PENDING_LOGS_KEY)).toBeNull();
  });

  it('still replays genuinely different sessions', async () => {
    localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify([
      { records: recordsFor('Beginner Full Body A'), queuedAt: '2026-09-14T07:46:00.000Z' },
      { records: recordsFor('Beginner Full Body B'), queuedAt: '2026-09-14T07:46:02.000Z' },
    ]));

    await flushPendingWorkoutLogs();

    expect(serverSaveCalls).toHaveLength(2);
  });

  // Path 2: the `online` listener and the auth-ready handler firing together.
  it('does not replay twice when two flushes overlap', async () => {
    localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify([
      { records: recordsFor('Beginner Full Body A'), queuedAt: '2026-09-14T07:46:00.000Z' },
    ]));

    await Promise.all([flushPendingWorkoutLogs(), flushPendingWorkoutLogs()]);

    expect(serverSaveCalls).toHaveLength(1);
    expect(localStorage.getItem(PENDING_LOGS_KEY)).toBeNull();
  });

  it('keeps a session queued when the replay fails', async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/api/save-workout-session')) {
        return { ok: false, status: 500, json: async () => ({ error: 'nope' }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const records = recordsFor('Beginner Full Body A');
    localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify([
      { records, queuedAt: '2026-09-14T07:46:00.000Z' },
    ]));

    const result = await flushPendingWorkoutLogs();

    expect(result.saved).toBe(0);
    expect(queueContents()).toHaveLength(1);
  });
});
