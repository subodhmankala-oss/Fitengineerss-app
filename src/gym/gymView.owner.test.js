import { describe, it, expect } from 'vitest';
import { isLikelyNotToRenew, likelyNotToRenew, firstThirtyDays, PLAN_FILTERS } from './gymView';

const c = (id, status, extra = {}) => ({ id, name: id.toUpperCase(), engagement: { status }, lastWorkout: null, ...extra });
const plan = (daysLeft, extra = {}) => ({ planName: 'Monthly', daysLeft, state: 'active', price: 3000, due: 0, ...extra });

describe('likely not to renew', () => {
  it('needs a plan ending within 14 days (or ended) AND slipping / quiet / inactive', () => {
    expect(isLikelyNotToRenew(c('a', 'quiet'), plan(14))).toBe(true);
    expect(isLikelyNotToRenew(c('a', 'slipping'), plan(0))).toBe(true);
    expect(isLikelyNotToRenew(c('a', 'inactive'), plan(-10))).toBe(true);
    expect(isLikelyNotToRenew(c('a', 'quiet'), plan(15))).toBe(false); // too far off
    ['thriving', 'steady', 'new'].forEach((s) => expect(isLikelyNotToRenew(c('a', s), plan(3))).toBe(false));
    expect(isLikelyNotToRenew(c('a', 'quiet'), undefined)).toBe(false); // no plan recorded
  });

  it('leaves out plans that ended long ago so ex-members do not pile up', () => {
    expect(isLikelyNotToRenew(c('a', 'quiet'), plan(-60))).toBe(true);
    expect(isLikelyNotToRenew(c('a', 'quiet'), plan(-61))).toBe(false);
  });

  it('counts a member who still owes money, since only the plan dates matter', () => {
    expect(isLikelyNotToRenew(c('a', 'quiet'), plan(5, { state: 'due', due: 500 }))).toBe(true);
  });

  it('lists the most urgent first and carries the last workout date', () => {
    const plans = { a: plan(10), b: plan(-5), d: plan(2), e: plan(2), f: plan(1) };
    const out = likelyNotToRenew([c('a', 'quiet', { lastWorkout: '2026-10-01' }), c('b', 'inactive'), c('d', 'slipping'), c('e', 'quiet'), c('f', 'steady'), c('z', 'quiet')], plans);
    expect(out.map((r) => r.client.id)).toEqual(['b', 'd', 'e', 'a']);
    expect(out[3].lastWorkout).toBe('2026-10-01');
    expect(out[0].lastWorkout).toBeNull();
  });

  it('has a matching Members filter chip', () => {
    const chip = PLAN_FILTERS.find((f) => f.key === 'notrenew');
    expect(chip.label).toBe('Likely not to renew');
    expect(chip.test(c('a', 'quiet'), { a: plan(4) })).toBe(true);
    expect(chip.test(c('a', 'steady'), { a: plan(4) })).toBe(false);
    expect(chip.test(c('a', 'quiet'), {})).toBe(false);
  });
});

describe('first 30 days', () => {
  const j = (joinedDaysAgo, firstWorkoutDay, workoutsFirst14d) => ({ journey: { joinedDaysAgo, firstWorkoutDay, workoutsFirst14d } });

  it('covers members who joined in the last 30 days, with their stages', () => {
    const { rows, summary } = firstThirtyDays([
      c('a', 'new', j(1, null, 0)), c('b', 'new', j(10, 0, 5)), c('d', 'new', j(20, 2, 2)),
      c('old', 'steady', j(30, 1, 6)), c('older', 'steady', { journey: null })
    ]);
    expect(rows.map((r) => r.client.id).sort()).toEqual(['a', 'b', 'd']);
    const by = (id) => rows.find((r) => r.client.id === id);
    expect(by('b')).toMatchObject({ started: true, hooked: true, dayN: 11, needsNudge: false });
    expect(by('d')).toMatchObject({ started: true, hooked: false, workouts: 2 });
    expect(summary).toEqual({ joined: 3, started: 2, hooked: 1, needNudge: 0 });
  });

  it('needs 4 or more workouts in the first 14 days to count as hooked', () => {
    expect(firstThirtyDays([c('a', 'new', j(12, 0, 4))]).rows[0].hooked).toBe(true);
    expect(firstThirtyDays([c('a', 'new', j(12, 0, 3))]).rows[0].hooked).toBe(false);
  });

  it('flags no first workout only once 3 days have passed, and shows those first', () => {
    const { rows, summary } = firstThirtyDays([c('a', 'new', j(2, null, 0)), c('b', 'new', j(3, null, 0)), c('d', 'new', j(9, null, 0)), c('e', 'new', j(15, 1, 2))]);
    expect(rows.map((r) => [r.client.id, r.needsNudge])).toEqual([['d', true], ['b', true], ['e', false], ['a', false]]);
    expect(summary.needNudge).toBe(2);
  });

  it('offers a trainer only to members who have none and are not self-guided', () => {
    const { rows } = firstThirtyDays([
      c('a', 'new', { ...j(5, null, 0), trainerName: null, selfGuided: false }),
      c('b', 'new', { ...j(5, null, 0), trainerName: 'Asha' }),
      c('d', 'new', { ...j(5, null, 0), trainerName: null, selfGuided: true })
    ]);
    const need = Object.fromEntries(rows.map((r) => [r.client.id, r.needsTrainer]));
    expect(need).toEqual({ a: true, b: false, d: false });
  });

  it('is empty without journey data', () => {
    expect(firstThirtyDays([c('a', 'new')])).toEqual({ rows: [], summary: { joined: 0, started: 0, hooked: 0, needNudge: 0 } });
  });
});
