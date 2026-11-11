import { describe, it, expect } from 'vitest';
import { buildOwnerReports, reportsLogSince } from './_ownerInsights.js';

const NOW = new Date('2026-11-10T06:00:00Z'); // IST date 2026-11-10
const members = [
  { id: 'c1', role: 'client', created_at: '2026-08-05T00:00:00Z' },
  { id: 'c2', role: 'client', created_at: '2026-08-20T00:00:00Z' },
  { id: 'c3', role: 'client', created_at: '2026-10-25T00:00:00Z' },
  { id: 't1', role: 'coach', created_at: '2026-01-01T00:00:00Z' }
];
const log = (user_id, log_date, exercise_name) => ({ user_id, log_date, exercise_name });

describe('buildOwnerReports', () => {
  it('log window starts at the first day of the month 3 back', () => {
    expect(reportsLogSince(NOW)).toBe('2026-08-01');
  });

  it('ranks exercises per member-day and compares with the same days last month', () => {
    const logs = [
      log('c1', '2026-11-03', 'Bench Press'), log('c1', '2026-11-03', 'Bench Press'), log('c1', '2026-11-03', 'Bench Press'),
      log('c2', '2026-11-05', 'Bench Press'),
      log('c1', '2026-11-05', 'Squat'),
      log('c1', '2026-10-04', 'Bench Press'), log('c2', '2026-10-06', 'Bench Press'), log('c2', '2026-10-09', 'Bench Press'), log('c1', '2026-10-09', 'Bench Press'),
      log('c1', '2026-10-20', 'Bench Press') // after day 10 of last month: not in the comparison
    ];
    const r = buildOwnerReports({ members, logs, now: NOW });
    const bench = r.exercises.find((e) => e.name === 'Bench Press');
    expect(bench).toMatchObject({ count: 2, lastMonth: 4 });
    expect(bench.change).toBe(-50);
    expect(r.exercises[0].name).toBe('Bench Press');
    expect(r.exercises.find((e) => e.name === 'Squat').change).toBeNull();
  });

  it('counts muscle sets, ignores non-members, and exposes no member ids', () => {
    const logs = [log('c1', '2026-11-03', 'Bench Press'), log('stranger', '2026-11-03', 'Bench Press')];
    const r = buildOwnerReports({ members, logs, now: NOW });
    expect(r.muscles.find((m) => m.name === 'Chest').count).toBe(1);
    expect(JSON.stringify(r)).not.toMatch(/c1|stranger/);
  });

  it('sums collections and joins per month', () => {
    const payments = [{ amount_inr: 1000, paid_on: '2026-11-02' }, { amount_inr: 500, paid_on: '2026-11-09' }, { amount_inr: 700, paid_on: '2026-10-30' }];
    const r = buildOwnerReports({ members, logs: [], payments, now: NOW });
    expect(r.months).toHaveLength(6);
    expect(r.months.at(-1)).toMatchObject({ key: '2026-11', collected: 1500, joined: 0 });
    expect(r.months.find((m) => m.key === '2026-10')).toMatchObject({ collected: 700, joined: 1 });
    expect(r.months.find((m) => m.key === '2026-08').joined).toBe(2);
  });

  it('measures retention 30 and 60 days after joining, only for members old enough', () => {
    const logs = [
      log('c1', '2026-09-08', 'Squat'), // day 34 after 08-05 -> kept at 30
      log('c1', '2026-10-10', 'Squat'), // day 66 -> kept at 60
      log('c2', '2026-09-22', 'Squat') // day 33 after 08-20 -> kept at 30 only
    ];
    const r = buildOwnerReports({ members, logs, now: NOW });
    const aug = r.months.find((m) => m.key === '2026-08');
    expect(aug.retention[30]).toEqual({ kept: 2, of: 2, pct: 100 });
    expect(aug.retention[60]).toEqual({ kept: 1, of: 2, pct: 50 });
    // joined 16 days ago: too early for either
    expect(r.months.find((m) => m.key === '2026-10').retention[30]).toBeNull();
  });

  it('converts leads by source over the last 90 days', () => {
    const leads = [
      { source: 'instagram', stage: 'joined', created_at: '2026-10-01T00:00:00Z' },
      { source: 'instagram', stage: 'trial_booked', created_at: '2026-10-02T00:00:00Z' },
      { source: 'instagram', stage: 'new', created_at: '2026-10-03T00:00:00Z' },
      { source: 'instagram', stage: 'new', created_at: '2026-10-04T00:00:00Z' },
      { source: 'walk-in', stage: 'trial_done', created_at: '2026-11-01T00:00:00Z' },
      { source: 'google', stage: 'joined', created_at: '2026-01-01T00:00:00Z' } // too old
    ];
    const r = buildOwnerReports({ members, logs: [], leads, now: NOW });
    expect(r.leads.map((l) => l.source)).toEqual(['instagram', 'walk-in']);
    expect(r.leads[0]).toMatchObject({ enquiries: 4, trials: 2, joined: 1, pct: 25 });
    expect(r.leads[1]).toMatchObject({ enquiries: 1, trials: 1, joined: 0, pct: 0 });
  });

  it('reports leads as null when the leads table is not there yet', () => {
    expect(buildOwnerReports({ members, logs: [], leads: null, now: NOW }).leads).toBeNull();
  });
});
