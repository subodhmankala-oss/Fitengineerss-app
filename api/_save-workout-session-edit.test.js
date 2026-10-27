// "Edit workout": only the four set columns change, only that user's rows on
// that date can be touched, and each session's calories move by its deltas.
import { describe, it, expect, beforeEach } from 'vitest';
import { editSavedSession } from './save-workout-session.js';

let dayRows;
let writes;
const json = (data, status = 200) => ({ ok: status < 300, status, json: async () => data });
const fakeFetch = async (url, opts = {}) => {
  const method = opts.method || 'GET';
  if (method === 'GET') return json(dayRows);
  writes.push({ method, url: decodeURIComponent(url), body: opts.body ? JSON.parse(opts.body) : null });
  return json(null, 204);
};
const run = (edit) => editSavedSession({ svcHeaders: {}, userId: 'u1', edit: { logDate: '2026-10-27', ...edit }, fetchImpl: fakeFetch });

describe('editSavedSession', () => {
  beforeEach(() => {
    writes = [];
    dayRows = [
      { id: 1, session_id: 's1', created_at: '2026-10-27T10:00:00Z', calories_burned: 300 },
      { id: 2, session_id: 's1', created_at: '2026-10-27T10:00:00Z', calories_burned: 300 },
      { id: 3, session_id: 's1', created_at: '2026-10-27T10:00:00Z', calories_burned: 300 }
    ];
  });

  it('patches only the set columns, deletes, then moves the session calories', async () => {
    const result = await run({
      updates: [{ id: 1, reps: 12, weight_kg: 40, exercise_name: 'Hacked', log_date: '2020-01-01' }],
      deletes: [3],
      kcalDeltas: { 1: 4, 3: -9 }
    });
    expect(result.status).toBe(200);
    const [patch, del, calories] = writes;
    expect(patch).toMatchObject({ method: 'PATCH', body: { reps: 12, weight_kg: 40 } });
    expect(patch.url).toContain('id=eq.1&user_id=eq.u1');
    expect(del.method).toBe('DELETE');
    expect(del.url).toContain('user_id=eq.u1&id=in.(3)');
    expect(calories.url).toContain('session_id=eq.s1');
    expect(calories.body).toEqual({ calories_burned: 295 });
  });

  it("refuses ids that aren't that user's rows on that date", async () => {
    const result = await run({ updates: [{ id: 99, reps: 5 }] });
    expect(result.status).toBe(404);
    expect(writes).toHaveLength(0);
  });

  it('refuses deleting every set', async () => {
    const result = await run({ deletes: [1, 2, 3] });
    expect(result.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it('never takes calories below zero', async () => {
    await run({ updates: [{ id: 1, reps: 1 }], kcalDeltas: { 1: -1000 } });
    expect(writes.at(-1).body).toEqual({ calories_burned: 0 });
  });
});
