import { describe, it, expect } from 'vitest';
import { getMuscleTargets, MUSCLE_TARGETS, normalizeTargetLevel, getWeeklyMuscleStats } from './muscleAnalytics';
import { regionBand, getMuscleGaps } from './muscleRegions';
import { resolveClientTrainingLevel } from './clientTrainingLevel';

const benchSets = (n, date = '2026-07-20') => Array.from({ length: n }, (_, i) => ({
  log_date: date, exercise_name: 'Bench Press', weight_kg: 40, reps: 10, set_type: null,
  created_at: `${date}T10:0${i}:00.000Z`,
}));

describe('weekly set targets by experience level', () => {
  it('uses smaller bands for beginners and larger for advanced', () => {
    expect(getMuscleTargets('beginner').Chest).toEqual({ min: 8, max: 12, target: 10 });
    expect(getMuscleTargets('intermediate').Chest).toEqual({ min: 12, max: 20, target: 16 });
    expect(getMuscleTargets('advanced').Chest).toEqual({ min: 15, max: 24, target: 20 });
    expect(getMuscleTargets('beginner').Biceps).toEqual({ min: 6, max: 10, target: 8 });
    expect(getMuscleTargets('beginner').Tibialis).toEqual({ min: 3, max: 6, target: 5 });
  });

  it('falls back to the original (intermediate) targets when the level is unknown', () => {
    expect(getMuscleTargets(null)).toBe(MUSCLE_TARGETS);
    expect(getMuscleTargets('expert-ish')).toBe(MUSCLE_TARGETS);
    expect(MUSCLE_TARGETS.Chest).toEqual({ min: 12, max: 20, target: 16 });
  });

  it('accepts the level spellings saved in the app', () => {
    expect(normalizeTargetLevel('Beginner')).toBe('beginner');
    expect(normalizeTargetLevel(' ADVANCED ')).toBe('advanced');
    expect(normalizeTargetLevel('Intermediate')).toBe('intermediate');
  });

  it('judges the same 10 chest sets Optimal for a beginner but Slightly Low for intermediate', () => {
    const logs = benchSets(10);
    const chest = level => getWeeklyMuscleStats(logs, '2026-07-20', '2026-07-26', { level }).find(m => m.muscle === 'Chest');
    expect(chest('beginner').status.key).toBe('optimal');
    expect(chest('beginner').target).toBe(10);
    expect(chest(null).status.key).toBe('slightly_low');
    expect(chest('advanced').status.key).toBe('undertrained');
  });

  it('scales the per-part bands with the level too', () => {
    const beginner = regionBand('Back', 'beginner');
    const intermediate = regionBand('Back');
    expect(beginner.max).toBeLessThan(intermediate.max);
    expect(regionBand('Back', 'advanced').max).toBeGreaterThan(intermediate.max);
  });

  it('the "behind this week" hint drops biceps for a beginner at 6 sets', () => {
    const logs = benchSets(6, '2026-07-24').map(l => ({ ...l, exercise_name: 'Barbell Curl' }));
    const hasBiceps = level => getMuscleGaps(logs, '2026-07-26', level).some(g => g.label === 'Biceps');
    expect(hasBiceps('beginner')).toBe(false);
    expect(hasBiceps(null)).toBe(true);
  });
});

describe('resolveClientTrainingLevel', () => {
  const now = new Date('2026-11-14T12:00:00').getTime();

  it('prefers the saved experience level', () => {
    expect(resolveClientTrainingLevel({ experienceLevel: 'Advanced' }, { level: 'beginner', since: '2026-11-01' }, now)).toBe('advanced');
  });

  it('uses the library level, stepped up one level per 12 weeks', () => {
    expect(resolveClientTrainingLevel(null, { level: 'beginner', since: '2026-11-01' }, now)).toBe('beginner');
    expect(resolveClientTrainingLevel(null, { level: 'beginner', since: '2026-08-01' }, now)).toBe('intermediate');
    expect(resolveClientTrainingLevel({ experienceLevel: '' }, { level: 'beginner', since: '2026-03-01' }, now)).toBe('advanced');
  });

  it('returns null when nothing is saved', () => {
    expect(resolveClientTrainingLevel(null, null, now)).toBeNull();
    expect(resolveClientTrainingLevel({ experienceLevel: '' }, { level: null }, now)).toBeNull();
  });
});
