// "Add missed exercise": new rows join the day's latest saved workout under
// its session_id, continue its session_row numbering, and every row (old and
// new) ends up carrying the raised calorie total.
import { describe, it, expect, beforeEach } from 'vitest';
import { appendToSavedSession } from './save-workout-session.js';

let existing;
let writes;
const json = (data, status = 200) => ({ ok: status < 300, status, json: async () => data });
const fakeFetch = async (url, opts = {}) => {
  const method = opts.method || 'GET';
  if (method === 'GET') return json(existing);
  writes.push({ method, url, body: JSON.parse(opts.body) });
  return json(null, 201);
};

const newSet = { user_id: 'u1', log_date: '2026-10-27', exercise_name: 'Triceps Pushdown', reps: 12, weight_kg: 25, plan_name: 'Custom Routine', duration_seconds: null, calories_burned: null, session_id: null, session_row: null };
const run = (records, append) => appendToSavedSession({ svcHeaders: {}, userId: 'u1', records, append, fetchImpl: fakeFetch });

describe('appendToSavedSession', () => {
  beforeEach(() => {
    writes = [];
    existing = [
      { session_id: 'session-2', session_row: 0, plan_name: 'Push Day', duration_seconds: 3120, calories_burned: 310, created_at: '2026-10-27T10:00:00Z' },
      { session_id: 'session-2', session_row: 5, plan_name: 'Push Day', duration_seconds: 3120, calories_burned: 310, created_at: '2026-10-27T10:00:00Z' },
      { session_id: 'session-1', session_row: 9, plan_name: 'Morning Run', duration_seconds: 900, calories_burned: 120, created_at: '2026-10-27T06:00:00Z' }
    ];
  });

  it('joins the latest session and raises its calories on every row', async () => {
    const result = await run([newSet, { ...newSet, reps: 10 }], { logDate: '2026-10-27', addedCalories: 24 });
    expect(result.status).toBe(200);
    expect(result.body.caloriesBurned).toBe(334);
    const [insert, patch] = writes;
    expect(insert.method).toBe('POST');
    expect(insert.body.map(r => [r.session_id, r.session_row])).toEqual([['session-2', 6], ['session-2', 7]]);
    expect(insert.body.every(r => r.plan_name === 'Push Day' && r.duration_seconds === 3120 && r.calories_burned === 334)).toBe(true);
    expect(patch.method).toBe('PATCH');
    expect(patch.url).toContain('session_id=eq.session-2');
    expect(patch.body).toEqual({ calories_burned: 334 });
  });

  it('gives a legacy workout (no session_id) its own session with only the added calories', async () => {
    existing = [{ session_id: null, session_row: null, plan_name: 'Leg Day', duration_seconds: 2000, calories_burned: 200, created_at: '2026-10-25T10:00:00Z' }];
    const result = await run([newSet], { logDate: '2026-10-25', addedCalories: 15 });
    expect(result.status).toBe(200);
    expect(writes).toHaveLength(1);
    const row = writes[0].body[0];
    expect(row.session_id).toMatch(/^missed-/);
    expect(row.calories_burned).toBe(15);
    expect(row.duration_seconds).toBeNull();
    expect(row.log_date).toBe('2026-10-25');
  });

  it('refuses a day with no saved workout', async () => {
    existing = [];
    const result = await run([newSet], { logDate: '2026-10-20', addedCalories: 10 });
    expect(result.status).toBe(404);
    expect(writes).toHaveLength(0);
  });

  it('rejects a malformed date', async () => {
    const result = await run([newSet], { logDate: 'yesterday', addedCalories: 10 });
    expect(result.status).toBe(400);
  });
});
