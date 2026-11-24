import { describe, it, expect } from 'vitest';
import { buildWeekPlan, cleanTrainingDays, mondayOf, sessionsFromLogs } from './weekPlan';

const A = { name: 'Beginner Full Body A' };
const B = { name: 'Beginner Full Body B' };
const C = { name: 'Beginner Lower & Core' };
const programs = [A, B, C];
const MWS = [0, 2, 5];
const did = (date, p, kcal = 0) => ({ date, planName: p.name, kcal });
const build = (over) => buildWeekPlan({ programs, sessions: [], days: MWS, since: '2026-11-01', today: '2026-11-23', ...over });
const view = (plan) => plan.slots.map(s => `${s.date.slice(8)} ${s.program.name.slice(9)}${s.done ? ' ✓' : ''}`);

// 2026-11-23 is a Monday.
describe('buildWeekPlan', () => {
  it('spreads the programs over the chosen days, today first', () => {
    const plan = build();
    expect(view(plan)).toEqual(['23 Full Body A', '25 Full Body B', '28 Lower & Core']);
    expect(plan.main).toBe(plan.slots[0]);
    expect(plan.main.isToday).toBe(true);
  });

  it('ticks what is done without moving the other cards', () => {
    const plan = build({ today: '2026-11-25', sessions: [did('2026-11-23', A, 240)] });
    expect(view(plan)).toEqual(['23 Full Body A ✓', '25 Full Body B', '28 Lower & Core']);
    expect(plan.slots[0].kcal).toBe(240);
    expect(plan.main.program).toBe(B);
  });

  it('carries on from the last program of the week before', () => {
    const plan = build({ sessions: [did('2026-11-18', A)] });
    expect(view(plan)).toEqual(['23 Full Body B', '25 Lower & Core', '28 Full Body A']);
  });

  it('a card done early is ticked, and the missed one stays playable', () => {
    const plan = build({ today: '2026-11-26', sessions: [did('2026-11-24', C)] });
    expect(view(plan)).toEqual(['23 Full Body A', '25 Full Body B', '28 Lower & Core ✓']);
    expect(plan.main.program).toBe(A); // nothing left ahead → first missed
    expect(plan.slots[0].isPast).toBe(true);
  });

  it('on a day off, shows the next one coming up before a missed one', () => {
    expect(build({ today: '2026-11-24' }).main.program).toBe(B);
  });

  it('mid-week joiner starts at the next chosen day', () => {
    const plan = build({ today: '2026-11-26', since: '2026-11-26' });
    expect(view(plan)).toEqual(['28 Full Body A']);
    expect(plan.main.isToday).toBe(false);
  });

  it('joined after the last chosen day: next week’s cards', () => {
    const plan = build({ today: '2026-11-29', since: '2026-11-29' });
    expect(plan.nextWeek).toBe(true);
    expect(view(plan)).toEqual(['30 Full Body A', '02 Full Body B', '05 Lower & Core']);
  });

  it('changing days mid-week keeps what was done and drops what wasn’t', () => {
    const plan = build({ days: [1, 3, 6], since: '2026-11-25', today: '2026-11-25', sessions: [did('2026-11-23', A)] });
    expect(view(plan)).toEqual(['23 Full Body A ✓', '26 Full Body B', '29 Lower & Core']);
  });

  it('week done', () => {
    const plan = build({ today: '2026-11-28', sessions: [did('2026-11-23', A), did('2026-11-25', B), did('2026-11-28', C)] });
    expect(plan).toMatchObject({ weekDone: true, doneCount: 3, main: null });
    expect(plan.nextProgram).toBe(A);
  });

  it('more days than programs: one workout ticks one card, not both', () => {
    const plan = build({ days: [0, 1, 2, 3, 4], today: '2026-11-26', sessions: [did('2026-11-23', A)] });
    expect(view(plan)).toEqual(['23 Full Body A ✓', '24 Full Body B', '25 Lower & Core', '26 Full Body A', '27 Full Body B']);
  });

  it('a workout that isn’t one of the programs ticks nothing', () => {
    const plan = build({ sessions: [{ date: '2026-11-23', planName: 'My own day', kcal: 0 }] });
    expect(plan.doneCount).toBe(0);
  });

  it('falls back to Mon/Wed/Sat for unusable days, and to nothing without programs', () => {
    expect(build({ days: [], since: null }).slots).toHaveLength(3);
    expect(build({ programs: [] })).toBeNull();
  });
});

describe('helpers', () => {
  it('cleanTrainingDays', () => {
    expect(cleanTrainingDays([5, 0, 0, 9, '2'])).toEqual([0, 2, 5]);
    expect(cleanTrainingDays([])).toBeNull();
    expect(cleanTrainingDays(null)).toBeNull();
  });

  it('mondayOf treats Sunday as the end of the week', () => {
    expect(mondayOf('2026-11-29')).toBe('2026-11-23');
    expect(mondayOf('2026-11-23')).toBe('2026-11-23');
  });

  it('sessionsFromLogs: one per program per day, calories counted once', () => {
    const row = { log_date: '2026-11-23', plan_name: 'Beginner Full Body A', calories_burned: 240 };
    expect(sessionsFromLogs([row, { ...row }, { log_date: '2026-11-23', plan_name: 'Core' }, { log_date: '2026-11-23' }]))
      .toEqual([{ date: '2026-11-23', planName: 'Beginner Full Body A', kcal: 240 }, { date: '2026-11-23', planName: 'Core', kcal: 0 }]);
  });
});
