import { describe, it, expect } from 'vitest';
import { CORE_PPL_TEMPLATES, buildThisWeekPlans } from './weekTemplates';

const set = (reps, weight, extra = {}) => ({ reps, weight, ...extra });
const session = (date, planName, extra = {}) => ({
  date,
  planName,
  caloriesBurned: 200,
  durationSeconds: 3000,
  exercises: [{ name: 'Lat Pull Down', sets: [set(10, 40), set(10, 40)] }],
  ...extra,
});

describe('CORE_PPL_TEMPLATES', () => {
  it('is Push, Pull, Legs with 5 exercises of 3 blank-weight sets each', () => {
    expect(CORE_PPL_TEMPLATES.map(t => t.planName)).toEqual(['Push Day', 'Pull Day', 'Leg Day']);
    CORE_PPL_TEMPLATES.forEach(t => {
      expect(t.exercises).toHaveLength(5);
      t.exercises.forEach(ex => {
        expect(ex.sets).toHaveLength(3);
        ex.sets.forEach(s => expect(s.weight).toBe(''));
      });
    });
  });

  it('gives every set its own object', () => {
    const [a, b] = CORE_PPL_TEMPLATES[0].exercises[0].sets;
    expect(a).not.toBe(b);
  });
});

describe('buildThisWeekPlans', () => {
  const today = '2026-10-23';

  it('keeps only workouts from the last 7 days, today included', () => {
    const plans = buildThisWeekPlans([
      session('2026-10-16', 'Too Old'),
      session('2026-10-17', 'Edge Of Week'),
      session('2026-10-23', 'Today'),
    ], today);
    expect(plans.map(p => p.planName).sort()).toEqual(['Edge Of Week', 'Today']);
  });

  it('orders best-performed first', () => {
    const plans = buildThisWeekPlans([
      session('2026-10-22', 'Light', { caloriesBurned: 100, durationSeconds: 1200 }),
      session('2026-10-20', 'Heavy', { caloriesBurned: 400, durationSeconds: 4000 }),
    ], today);
    expect(plans.map(p => p.planName)).toEqual(['Heavy', 'Light']);
  });

  it('breaks a tie with the most recent', () => {
    const plans = buildThisWeekPlans([
      session('2026-10-19', 'Older'),
      session('2026-10-22', 'Newer'),
    ], today);
    expect(plans.map(p => p.planName)).toEqual(['Newer', 'Older']);
  });

  it('uses the latest session of a repeated name and lists it once', () => {
    const plans = buildThisWeekPlans([
      session('2026-10-18', 'Back', { exercises: [{ name: 'Lat Pull Down', sets: [set(10, 35)] }] }),
      session('2026-10-22', 'back ', { exercises: [{ name: 'Lat Pull Down', sets: [set(10, 45)] }] }),
    ], today);
    expect(plans).toHaveLength(1);
    expect(plans[0].exercises[0].sets[0].weight).toBe(45);
  });

  it('drops warm-up moves and warm-up sets', () => {
    const plans = buildThisWeekPlans([
      session('2026-10-22', 'Upper', {
        exercises: [
          { name: 'Arm Circle', sets: [set(10, 0, { isWarmup: true })] },
          { name: 'Lat Pull Down', sets: [set(12, 20, { isWarmup: true }), set(10, 40)] },
        ],
      }),
    ], today);
    expect(plans[0].exercises).toEqual([{ name: 'Lat Pull Down', sets: [{ reps: 10, weight: 40 }] }]);
  });

  it('skips names already shown as a pinned or saved template', () => {
    const plans = buildThisWeekPlans([
      session('2026-10-22', 'Push Day'),
      session('2026-10-21', 'My Arms'),
      session('2026-10-20', 'Cardio Mix'),
    ], today, ['push day', 'My Arms']);
    expect(plans.map(p => p.planName)).toEqual(['Cardio Mix']);
  });

  it('caps the list', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => session(`2026-10-${18 + i}`, n));
    expect(buildThisWeekPlans(many, today, [], 5)).toHaveLength(5);
  });
});
