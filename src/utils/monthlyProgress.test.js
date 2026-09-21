import { describe, it, expect } from 'vitest';
import {
  computeMonthStats, buildMonthlyReport, computeDeltas, shiftMonthKey, defaultReportMonth,
  formatVolume, formatDurationShort, formatDelta, suggestCoachMessage, formatMonthKey,
  consistencyTier, volumeEquivalent, reportHeadline
} from './monthlyProgress';

const log = (overrides) => ({
  log_date: '2026-08-10', plan_name: 'Push Day', exercise_name: 'Bench Press', set_number: 1,
  weight_kg: 60, reps: 8, set_type: null, duration_seconds: null, calories_burned: null,
  created_at: '2026-08-10T10:00:00.000Z', ...overrides
});

// Two sessions in Aug (one with timer stats), one in Jul, none in Jun.
const LOGS = [
  log({ log_date: '2026-08-03', exercise_name: 'Squat', weight_kg: 100, reps: 5, duration_seconds: 3600, calories_burned: 400 }),
  log({ log_date: '2026-08-03', exercise_name: 'Squat', weight_kg: 100, reps: 5, set_number: 2, duration_seconds: 3600, calories_burned: 400 }),
  log({ log_date: '2026-08-03', exercise_name: 'Squat', weight_kg: 40, reps: 5, set_type: 'warmup', duration_seconds: 3600, calories_burned: 400 }),
  log({ log_date: '2026-08-10', exercise_name: 'Bench Press', weight_kg: 60, reps: 8 }),
  log({ log_date: '2026-08-10', exercise_name: 'Treadmill', weight_kg: 0, reps: 0, distance_km: 5, cardio_duration_seconds: 1800 }),
  log({ log_date: '2026-07-20', exercise_name: 'Squat', weight_kg: 92.5, reps: 5 }),
  log({ log_date: '2026-07-20', exercise_name: 'Bench Press', weight_kg: 62.5, reps: 6 })
];

describe('month keys', () => {
  it('shifts across year boundaries', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
  });
  it('defaults to the last completed month', () => {
    expect(defaultReportMonth(new Date(2026, 8, 21))).toBe('2026-08');
  });
  it('formats headers', () => {
    expect(formatMonthKey('2026-08')).toBe('Aug 2026');
    expect(formatMonthKey('2026-08', { withYear: false })).toBe('Aug');
  });
});

describe('computeMonthStats', () => {
  it('groups sessions by date + plan and reads timer stats once per session', () => {
    const s = computeMonthStats(LOGS, '2026-08');
    expect(s.sessions).toBe(2);
    expect(s.activeDays).toBe(2);
    expect(s.totalDurationSec).toBe(3600);
    expect(s.totalCalories).toBe(400);
  });

  it('counts working sets only and ignores cardio in volume', () => {
    const s = computeMonthStats(LOGS, '2026-08');
    // 2 squat working sets + 1 bench + 1 treadmill (countable, but 0 volume); warmup excluded.
    expect(s.totalSets).toBe(4);
    expect(s.totalVolumeKg).toBe(100 * 5 * 2 + 60 * 8);
  });

  it('detects PRs against all history before the month', () => {
    const s = computeMonthStats(LOGS, '2026-08');
    // Squat 100 > 92.5 (PR); Bench 60 < 62.5 (not a PR)
    expect(s.prCount).toBe(1);
    expect(s.topLifts[0]).toMatchObject({ exercise: 'Squat', bestWeightKg: 100, bestReps: 5, prevBestWeightKg: 92.5 });
  });

  it('returns zeros for an empty month', () => {
    const s = computeMonthStats(LOGS, '2026-06');
    expect(s.sessions).toBe(0);
    expect(s.totalVolumeKg).toBe(0);
    expect(s.topLifts).toEqual([]);
  });
});

describe('buildMonthlyReport', () => {
  const r = buildMonthlyReport(LOGS, '2026-08');

  it('snapshots three months and marks empty ones', () => {
    expect(r.current.hasData).toBe(true);
    expect(r.previous.hasData).toBe(true);
    expect(r.prevPrevious.hasData).toBe(false);
    expect(r.current.bestLifts).toBeUndefined();
  });

  it('computes deltas vs previous month', () => {
    expect(r.deltas.sessions).toEqual({ abs: 1, pct: 100 });
    expect(r.deltas.prCount.abs).toBe(1);
  });

  it('gives null deltas when the previous month is empty', () => {
    const d = computeDeltas({ sessions: 3 }, { hasData: false });
    expect(d.sessions).toEqual({ abs: null, pct: null });
  });

  it('builds lift rows across the three columns', () => {
    expect(r.liftRows[0]).toEqual({ exercise: 'Squat', prevPrevious: null, previous: 92.5, current: 100, currentReps: 5 });
  });
});

describe('formatting', () => {
  it('formats volume, duration and deltas', () => {
    expect(formatVolume(48600)).toBe('48,600 kg');
    expect(formatVolume(950)).toBe('950 kg');
    expect(formatVolume(null)).toBe('—');
    expect(formatDurationShort(33600)).toBe('9h 20m');
    expect(formatDurationShort(1500)).toBe('25m');
    expect(formatDelta({ abs: 3, pct: 33 })).toEqual({ text: '▲ 3', dir: 'up' });
    expect(formatDelta({ abs: -2, pct: -18 }, { pct: true })).toEqual({ text: '▼ 18%', dir: 'down' });
    expect(formatDelta({ abs: null, pct: null })).toEqual({ text: '', dir: 'flat' });
    expect(formatDelta({ abs: 0, pct: 0 })).toEqual({ text: '—', dir: 'flat' });
  });

  it('suggests a message from the numbers', () => {
    const r = buildMonthlyReport(LOGS, '2026-08');
    const msg = suggestCoachMessage(r, 'Priya');
    expect(msg).toContain('Priya');
    expect(msg).toContain('2 sessions in Aug, up from 1');
    expect(msg).toContain('1 new PR');
    expect(msg).toContain('Squat moved to 100 kg');
  });

  it('handles a month with no workouts', () => {
    const r = buildMonthlyReport(LOGS, '2026-06');
    expect(suggestCoachMessage(r, 'Priya')).toContain("didn't see any logged workouts in Jun");
  });
});

describe('flavour', () => {
  it('tiers consistency by sessions per week', () => {
    expect(consistencyTier(0).label).toBe('Rest month');
    expect(consistencyTier(0.7).label).toBe('Warming up');
    expect(consistencyTier(2).label).toBe('Building');
    expect(consistencyTier(3).label).toBe('Consistent');
    expect(consistencyTier(4.2).label).toBe('On fire');
  });

  it('picks a readable volume equivalent', () => {
    expect(volumeEquivalent(1800)).toBe("that's like lifting 1.8 small cars");
    expect(volumeEquivalent(1000)).toBe("that's like lifting a small car");
    expect(volumeEquivalent(48600)).toBe("that's like lifting 1.2 loaded trucks");
    expect(volumeEquivalent(20)).toBeNull();
  });

  it('leads with the most flattering true headline', () => {
    const r = buildMonthlyReport(LOGS, '2026-08');
    expect(reportHeadline(r)).toBe('New PR: Squat 100 kg 🏆');
    expect(reportHeadline(buildMonthlyReport(LOGS, '2026-06'))).toContain('quiet month');
  });
});
