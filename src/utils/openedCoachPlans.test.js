import { describe, it, expect, beforeEach } from 'vitest';
import { getUnopenedCoachPlans as getUnopened, markPlanOpened, getOpenedPlanIds } from './openedCoachPlans';

const NOW = Date.parse('2026-10-03T12:00:00Z');
const getUnopenedCoachPlans = (plans, logs) => getUnopened(plans, logs, NOW);

const coachPlan = (overrides = {}) => ({
  id: 'p1', planName: 'Push Day', createdBy: 'coach', isAssigned: true,
  createdAt: '2026-10-01T09:00:00Z', exercises: [{ name: 'Bench Press', sets: [] }],
  ...overrides
});

describe('getUnopenedCoachPlans', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userId', 'u1');
  });

  it('shows a freshly assigned coach plan', () => {
    expect(getUnopenedCoachPlans([coachPlan()], [])).toHaveLength(1);
  });

  it('hides it once started on this device', () => {
    markPlanOpened('p1');
    expect(getOpenedPlanIds().has('p1')).toBe(true);
    expect(getUnopenedCoachPlans([coachPlan()], [])).toHaveLength(0);
  });

  it('starting one plan leaves the other on Home', () => {
    markPlanOpened('p1');
    const other = coachPlan({ id: 'p2', planName: 'Pull Day' });
    expect(getUnopenedCoachPlans([coachPlan(), other], []).map(p => p.id)).toEqual(['p2']);
  });

  it('hides it once logged on another device (log with that name on/after the assign day)', () => {
    const logs = [{ log_date: '2026-10-02', plan_name: 'push day' }];
    expect(getUnopenedCoachPlans([coachPlan()], logs)).toHaveLength(0);
  });

  it('ignores a log of the same name from before it was assigned', () => {
    const logs = [{ log_date: '2026-09-20', plan_name: 'Push Day' }];
    expect(getUnopenedCoachPlans([coachPlan()], logs)).toHaveLength(1);
  });

  it('skips client templates and unassigned coach records', () => {
    const plans = [coachPlan({ id: 'a', createdBy: 'client' }), coachPlan({ id: 'b', isAssigned: false })];
    expect(getUnopenedCoachPlans(plans, [])).toHaveLength(0);
  });

  it('only surfaces plans sent in the last 7 days', () => {
    const old = coachPlan({ id: 'old', createdAt: '2026-09-22T10:00:00Z' });
    expect(getUnopenedCoachPlans([old, coachPlan()], []).map(p => p.id)).toEqual(['p1']);
  });

  it('keeps the opened list per user', () => {
    markPlanOpened('p1');
    localStorage.setItem('userId', 'u2');
    expect(getUnopenedCoachPlans([coachPlan()], [])).toHaveLength(1);
  });
});
