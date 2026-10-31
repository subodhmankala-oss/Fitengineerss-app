import { describe, it, expect } from 'vitest';
import { tickedSetRows, weekBoundsFor, liveMuscleSummary, liftedKg, liftObjectFor, beatsLastTime, LIFT_OBJECTS } from './liveSessionStats';
import { MUSCLE_TARGETS } from './muscleAnalytics';

const set = (overrides) => ({ weight: '40', reps: '10', isCompleted: true, completedAt: 1000, ...overrides });
const saved = (overrides) => ({ log_date: '2026-10-27', exercise_name: 'Bench Press', weight_kg: 40, reps: 10, set_type: 'normal', ...overrides });

describe('tickedSetRows', () => {
  it('turns only ticked sets into workout_logs-shaped rows', () => {
    const rows = tickedSetRows([
      { name: 'Bench Press', sets: [set(), set({ isCompleted: false }), set({ weight: '42.5', reps: '8' })] },
    ], '2026-10-31');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ log_date: '2026-10-31', exercise_name: 'Bench Press', weight_kg: 42.5, reps: 8, set_number: 3, set_type: 'normal' });
  });

  it('marks warm-up sets as warmup', () => {
    const [row] = tickedSetRows([{ name: 'Arm Circle', sets: [set({ isWarmup: true })] }], '2026-10-31');
    expect(row.set_type).toBe('warmup');
  });
});

describe('weekBoundsFor', () => {
  it('is the Monday–Sunday week, Sunday included', () => {
    expect(weekBoundsFor('2026-10-31')).toEqual(['2026-10-26', '2026-11-01']);
    expect(weekBoundsFor('2026-11-01')).toEqual(['2026-10-26', '2026-11-01']);
    expect(weekBoundsFor('2026-10-26')).toEqual(['2026-10-26', '2026-11-01']);
  });
});

describe('liveMuscleSummary', () => {
  const savedLogs = [saved(), saved(), saved(), saved({ log_date: '2026-10-20' })];

  it('adds ticked sets to this week\'s saved sets for the muscle just trained', () => {
    const { worked, focus } = liveMuscleSummary(savedLogs, [
      { name: 'Bench Press', sets: [set(), set(), set({ isCompleted: false })] },
    ], '2026-10-31');
    expect(worked[0]).toEqual({ muscle: 'Chest', sets: 2 });
    expect(worked.map(w => w.muscle)).toContain('Triceps');
    const target = MUSCLE_TARGETS.Chest.target;
    expect(focus).toEqual({ muscle: 'Chest', sets: 5, target, left: target - 5 });
  });

  it('follows the most recently ticked exercise', () => {
    const { focus } = liveMuscleSummary([], [
      { name: 'Barbell Row', sets: [set({ completedAt: 3000 })] },
      { name: 'Bench Press', sets: [set({ completedAt: 2000 })] },
    ], '2026-10-31');
    expect(focus.muscle).toBe('Back');
  });

  it('has no focus and nothing worked before the first tick', () => {
    expect(liveMuscleSummary(savedLogs, [{ name: 'Bench Press', sets: [set({ isCompleted: false })] }], '2026-10-31'))
      .toEqual({ worked: [], focus: null });
  });

  it('ignores warm-up sets', () => {
    const { worked } = liveMuscleSummary([], [{ name: 'Bench Press', sets: [set({ isWarmup: true })] }], '2026-10-31');
    expect(worked).toEqual([]);
  });

  it('says nothing is left once the target is reached', () => {
    const target = MUSCLE_TARGETS.Chest.target;
    const many = Array.from({ length: target }, () => saved());
    const { focus } = liveMuscleSummary(many, [{ name: 'Bench Press', sets: [set()] }], '2026-10-31');
    expect(focus.left).toBe(0);
  });
});

describe('liftedKg', () => {
  it('sums weight × reps of ticked working sets', () => {
    expect(liftedKg([
      { name: 'Bench Press', sets: [set(), set({ weight: '42.5' }), set({ isCompleted: false }), set({ isWarmup: true })] },
    ], '2026-10-31')).toBe(825);
  });
});

describe('liftObjectFor', () => {
  it('names the heaviest object passed and the next one up', () => {
    expect(liftObjectFor(0)).toEqual({ reached: null, next: LIFT_OBJECTS[0] });
    expect(liftObjectFor(950)).toMatchObject({ reached: { key: 'car' }, next: { key: 'suv' } });
    expect(liftObjectFor(900)).toMatchObject({ reached: { key: 'car' } });
    expect(liftObjectFor(20000)).toMatchObject({ reached: { key: 'truck' }, next: null });
  });
});

describe('beatsLastTime', () => {
  const prev = { weight: '40', reps: '10' };
  it('is a best with more weight or more reps, never less of either', () => {
    expect(beatsLastTime('Bench Press', set({ weight: '42.5' }), prev)).toBe(true);
    expect(beatsLastTime('Bench Press', set({ reps: '11' }), prev)).toBe(true);
    expect(beatsLastTime('Bench Press', set(), prev)).toBe(false);
    expect(beatsLastTime('Bench Press', set({ weight: '45', reps: '8' }), prev)).toBe(false);
  });

  it('counts more reps on a bodyweight exercise', () => {
    expect(beatsLastTime('Push Up', set({ weight: '0', reps: '15' }), { weight: '0', reps: '12' })).toBe(true);
  });

  it('never fires without a last time, for warm-ups, or for cardio', () => {
    expect(beatsLastTime('Bench Press', set({ weight: '50' }), null)).toBe(false);
    expect(beatsLastTime('Bench Press', set({ weight: '50', isWarmup: true }), prev)).toBe(false);
    expect(beatsLastTime('Running', set({ weight: '50' }), prev)).toBe(false);
  });
});
