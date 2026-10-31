import { describe, it, expect } from 'vitest';
import { coachInsight, coachStats, estimatedMax, strengthChange, START_INSIGHT } from './liveCoach';
import { MUSCLE_TARGETS } from './muscleAnalytics';

const LOG_DATE = '2026-10-31';
const NOW = new Date('2026-10-31T10:00:00');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const set = (weight, reps, completedAt = 1, extra = {}) => ({ weight: String(weight), reps: String(reps), isCompleted: true, completedAt, ...extra });
const row = (log_date, weight_kg, reps, extra = {}) => ({
  log_date, exercise_name: 'Bench Press', weight_kg, reps, set_type: 'normal', created_at: `${log_date}T10:00:00.000Z`, ...extra,
});

const insightFor = (exercise, savedLogs = [], extra = {}) => {
  const set = [...exercise.sets].filter(s => s.isCompleted).sort((a, b) => a.completedAt - b.completedAt).pop();
  return coachInsight({ exercise, set, exercises: [exercise], logDate: LOG_DATE, savedLogs, now: NOW, ...extra });
};

describe('estimatedMax', () => {
  it('uses Epley and skips sets it cannot judge', () => {
    expect(estimatedMax(60, 10)).toBe(80);
    expect(estimatedMax(0, 10)).toBe(0);
    expect(estimatedMax(20, 25)).toBe(0);
  });
});

describe('coachInsight', () => {
  it('spots tired reps and suggests a lighter weight', () => {
    const ex = { name: 'Bench Press', sets: [set(40, 10, 1), set(40, 7, 2)] };
    const insight = insightFor(ex);
    expect(insight.kind).toBe('tired');
    expect(insight.muscle).toBe('Chest');
    expect(insight.text).toBe('Reps fell from 10 to 7. Your chest is tired. Stop Bench Press here, or drop to 35 kg for one more set.');
  });

  it('is not tired for a small drop', () => {
    const ex = { name: 'Bench Press', sets: [set(40, 10, 1), set(40, 8, 2)] };
    expect(insightFor(ex).kind).not.toBe('tired');
  });

  it('warns when the muscle was trained yesterday and is not recovered', () => {
    const saved = [1, 2, 3].map(() => row('2026-10-30', 40, 10, { created_at: hoursAgo(20) }));
    const insight = insightFor({ name: 'Bench Press', sets: [set(40, 10)] }, saved);
    expect(insight.kind).toBe('recovery');
    expect(insight.text).toMatch(/^You trained chest yesterday\. It is about \d+% recovered, so don't go to your limit today\.$/);
  });

  it('says recovery only once per exercise', () => {
    const saved = [1, 2, 3].map(() => row('2026-10-30', 40, 10, { created_at: hoursAgo(20) }));
    const insight = insightFor({ name: 'Bench Press', sets: [set(40, 10)] }, saved, { said: new Set(['recovery:Bench Press']) });
    expect(insight.kind).not.toBe('recovery');
  });

  it('suggests more weight after the same load three sessions running', () => {
    const saved = [row('2026-10-20', 40, 10), row('2026-10-20', 40, 10), row('2026-10-24', 40, 10)];
    const insight = insightFor({ name: 'Bench Press', sets: [set(40, 10)] }, saved);
    expect(insight.kind).toBe('more');
    expect(insight.text).toBe("You've done 40 kg × 10 on Bench Press 3 times now. Try 42.5 kg on your next set.");
  });

  it('does not suggest more after only two sessions', () => {
    const insight = insightFor({ name: 'Bench Press', sets: [set(40, 10)] }, [row('2026-10-24', 40, 10)]);
    expect(insight.kind).not.toBe('more');
  });

  it('celebrates a set that beats last time', () => {
    const insight = insightFor({ name: 'Bench Press', sets: [set(42.5, 10)] }, [], { prevSet: { weight: '40', reps: '10' } });
    expect(insight).toMatchObject({ kind: 'best', text: 'New best on Bench Press: 42.5 kg × 10. Better than last time.' });
  });

  it('reports a strength gain on the last 30 days', () => {
    const insight = insightFor({ name: 'Bench Press', sets: [set(42.5, 8)] }, [row('2026-10-21', 40, 8)]);
    expect(insight).toMatchObject({ kind: 'strength', text: 'Bench Press strength is up 6% on last month. Nice work.' });
  });

  it('falls back to the week count', () => {
    const insight = insightFor({ name: 'Bench Press', sets: [set(40, 10)] });
    const target = MUSCLE_TARGETS.Chest.target;
    expect(insight).toMatchObject({ kind: 'week', muscle: 'Chest', text: `Chest: 1 of ${target} sets this week. ${target - 1} more to go.` });
  });

  it('keeps it simple for exercises with no muscle', () => {
    expect(insightFor({ name: 'Running', sets: [{ distanceKm: '2', time: '10:00', isCompleted: true, completedAt: 1 }] }).text)
      .toBe('Running logged. Keep going.');
  });

  it('has a friendly start line', () => {
    expect(START_INSIGHT.kind).toBe('start');
  });
});

describe('strengthChange / coachStats', () => {
  it('compares today with the best of the last 30 days only', () => {
    const ex = { name: 'Bench Press', sets: [set(40, 8)] };
    expect(strengthChange(ex, [row('2026-09-01', 60, 8)], LOG_DATE)).toBeNull();
    expect(strengthChange(ex, [row('2026-10-21', 40, 8)], LOG_DATE)).toBe(0);
  });

  it('gives strength, week sets and rest for the exercise', () => {
    const ex = { name: 'Bench Press', sets: [set(42.5, 8)] };
    const stats = coachStats({ exercise: ex, exercises: [ex], logDate: LOG_DATE, savedLogs: [row('2026-10-27', 40, 8)], now: NOW });
    expect(stats).toEqual({ muscle: 'Chest', strengthPct: 6, weekSets: 2, weekTarget: MUSCLE_TARGETS.Chest.target, recoveredPct: 100 });
  });
});
