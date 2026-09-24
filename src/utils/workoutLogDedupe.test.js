import { describe, it, expect } from 'vitest';
import { dropDuplicateSessionBatches } from './workoutLogDedupe';

const row = (overrides) => ({
  user_id: 'u1', log_date: '2026-08-27', plan_name: 'Upper body', exercise_name: 'Barbell Curl',
  set_number: 1, reps: 15, weight_kg: '10', distance_km: null, cardio_duration_seconds: null,
  set_type: null, calories_burned: '95.3', duration_seconds: 2400,
  created_at: '2026-08-27T12:29:09.630819+00:00', ...overrides
});

const session = (createdAt, extra = {}) => [
  row({ created_at: createdAt, set_number: 1, ...extra }),
  row({ created_at: createdAt, set_number: 2, reps: 5, weight_kg: '15', ...extra }),
  row({ created_at: createdAt, exercise_name: 'Treadmill', set_number: 1, reps: 0, weight_kg: '0', distance_km: '2.5', cardio_duration_seconds: 1200, ...extra })
];

describe('dropDuplicateSessionBatches', () => {
  it('keeps a single save untouched', () => {
    const rows = session('2026-08-27T12:29:09Z');
    expect(dropDuplicateSessionBatches(rows)).toBe(rows);
  });

  it('drops re-uploaded copies of the same workout, keeping the earliest', () => {
    const original = session('2026-08-27T12:29:09Z');
    const copy1 = session('2026-09-02T11:29:07Z');
    const copy2 = session('2026-09-11T11:31:01Z');
    const out = dropDuplicateSessionBatches([...copy2, ...original, ...copy1]);
    expect(out).toHaveLength(3);
    expect(out.every(r => r.created_at === '2026-08-27T12:29:09Z')).toBe(true);
  });

  it('drops a copy rebuilt from duplicated rows (every set twice, renumbered)', () => {
    const original = session('2026-08-27T12:29:09Z');
    const doubled = [...session('2026-09-11T11:31:01Z'), ...session('2026-09-11T11:31:01Z')]
      .map((r, i) => ({ ...r, set_number: i + 1 }));
    expect(dropDuplicateSessionBatches([...original, ...doubled])).toHaveLength(3);
  });

  it('keeps two real sessions on the same day', () => {
    const morning = session('2026-08-27T05:00:00Z');
    const evening = session('2026-08-27T12:00:00Z', { calories_burned: '120.4', duration_seconds: 3100 });
    expect(dropDuplicateSessionBatches([...morning, ...evening])).toHaveLength(6);
  });

  it('keeps the same plan on different days', () => {
    const a = session('2026-08-27T05:00:00Z');
    const b = session('2026-08-28T05:00:00Z', { log_date: '2026-08-28' });
    expect(dropDuplicateSessionBatches([...a, ...b])).toHaveLength(6);
  });

  it('treats weight "10" and 10 as the same value', () => {
    const a = session('2026-08-27T05:00:00Z');
    const b = session('2026-08-27T06:00:00Z').map(r => ({ ...r, weight_kg: Number(r.weight_kg) }));
    expect(dropDuplicateSessionBatches([...a, ...b])).toHaveLength(3);
  });

  it('groups by session_id when present, even across created_at values', () => {
    const a = session('2026-08-27T05:00:00Z', { session_id: 'session-1' });
    const b = [row({ created_at: '2026-08-27T05:00:01Z', session_id: 'session-1', exercise_name: 'Squat' })];
    expect(dropDuplicateSessionBatches([...a, ...b])).toHaveLength(4);
  });

  it('never drops rows it cannot group', () => {
    const rows = [row({ created_at: null }), row({ created_at: null })];
    expect(dropDuplicateSessionBatches(rows)).toHaveLength(2);
  });
});
