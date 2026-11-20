import { describe, it, expect } from 'vitest';
import { buildDailyWarmup, getDailyWarmupIndex, getWarmupWhy, withoutWarmups } from './dailyWarmup';

const legDay = [{ name: 'Barbell Squat' }, { name: 'Leg Press' }, { name: 'Leg Extension' }];
const chestDay = [{ name: 'Bench Press' }, { name: 'Incline Dumbbell Press' }, { name: 'Chest Fly' }];
// Monday 16 Nov 2026 … Sunday 22 Nov 2026 (local dates)
const weekOf = (d) => Array.from({ length: 7 }, (_, i) => new Date(2026, 10, d + i));

describe('getDailyWarmupIndex', () => {
  it('gives every day of a week its own warm-up', () => {
    const idx = weekOf(16).map(getDailyWarmupIndex);
    expect(new Set(idx).size).toBe(7);
  });

  it('shifts the week, so next Monday differs from this Monday', () => {
    expect(getDailyWarmupIndex(new Date(2026, 10, 23))).not.toBe(getDailyWarmupIndex(new Date(2026, 10, 16)));
  });
});

describe('buildDailyWarmup', () => {
  it('builds a cardio move plus two moves, all tagged warm-up', () => {
    const w = buildDailyWarmup({ planName: 'Legs', exercises: legDay, date: new Date(2026, 10, 17) });
    expect(w).toHaveLength(3);
    w.forEach(ex => ex.sets.forEach(s => {
      expect(s.isWarmup).toBe(true);
      expect(s.setType).toBe('warmup');
    }));
  });

  it('never repeats a warm-up on two leg days in the same week', () => {
    const names = weekOf(16).map(date => buildDailyWarmup({ planName: 'Legs', exercises: legDay, date }).map(e => e.name).join(','));
    expect(new Set(names).size).toBe(7);
  });

  it('picks moves for the day type', () => {
    const upper = buildDailyWarmup({ planName: 'Chest', exercises: chestDay, date: new Date(2026, 10, 16) });
    expect(upper[0].warmupWhy).toMatch(/^Upper body today\. /);
    const lower = buildDailyWarmup({ planName: 'Legs', exercises: legDay, date: new Date(2026, 10, 16) });
    expect(upper.slice(1).map(e => e.name)).not.toEqual(lower.slice(1).map(e => e.name));
  });

  it('puts the reason on the first move only', () => {
    const w = buildDailyWarmup({ planName: 'Legs', exercises: legDay, date: new Date(2026, 10, 16) });
    expect(w[0].warmupWhy).toMatch(/^Leg day\. /);
    expect(w.slice(1).some(e => e.warmupWhy)).toBe(false);
    expect(getWarmupWhy([...w, ...legDay])).toBe(w[0].warmupWhy);
  });

  it('swaps out a warm-up move the plan already has', () => {
    const date = new Date(2026, 10, 16);
    const plain = buildDailyWarmup({ planName: 'Legs', exercises: legDay, date }).map(e => e.name);
    const plan = [...legDay, { name: plain[2] }];
    const names = buildDailyWarmup({ planName: 'Legs', exercises: plan, date }).map(e => e.name);
    expect(names).not.toContain(plain[2]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('is the same for the client and the coach on the same day', () => {
    const date = new Date(2026, 10, 19);
    expect(buildDailyWarmup({ planName: 'Legs', exercises: legDay, date }))
      .toEqual(buildDailyWarmup({ planName: 'Legs', exercises: legDay, date }));
  });
});

describe('withoutWarmups', () => {
  it('drops a plan\'s own warm-up moves and keeps the work', () => {
    const plan = [
      { name: 'Arm Circle', sets: [{ reps: 10 }] },
      { name: 'Cycling', sets: [{ time: '04:00', isWarmup: true }] },
      ...legDay.map(e => ({ ...e, sets: [{ reps: 8 }] })),
    ];
    expect(withoutWarmups(plan).map(e => e.name)).toEqual(legDay.map(e => e.name));
  });
});
