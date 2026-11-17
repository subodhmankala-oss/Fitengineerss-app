import { describe, it, expect } from 'vitest';
import { weekDates, trainedDatesByClient, clientGlance, NEEDS_YOU_DAYS } from './clientWeekGlance';

// 2026-11-19 is a Thursday.
const TODAY = '2026-11-19';
const NOW = new Date(2026, 10, 19, 12).getTime();
const OLD_CLIENT = { id: 'a', joined_at: '2026-01-01T00:00:00Z' };

describe('weekDates', () => {
  it('runs Monday to Sunday around today', () => {
    expect(weekDates(TODAY)).toEqual([
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'
    ]);
  });
  it('treats Sunday as the end of the week', () => {
    expect(weekDates('2026-11-22')[0]).toBe('2026-11-16');
  });
});

describe('trainedDatesByClient', () => {
  it('collapses set rows into one date per day', () => {
    const map = trainedDatesByClient([
      { user_id: 'a', log_date: '2026-11-17' },
      { user_id: 'a', log_date: '2026-11-17' },
      { user_id: 'b', log_date: '2026-11-18' },
    ]);
    expect([...map.a]).toEqual(['2026-11-17']);
    expect([...map.b]).toEqual(['2026-11-18']);
  });
});

describe('clientGlance', () => {
  it('marks trained days this week and today', () => {
    const g = clientGlance(OLD_CLIENT, new Set(['2026-11-16', '2026-11-19', '2026-11-10']), TODAY, NOW);
    expect(g.days).toEqual([true, false, false, true, false, false, false]);
    expect(g.todayIndex).toBe(3);
    expect(g.weekCount).toBe(2);
    expect(g.needsYou).toBe(false);
    expect(g.label).toBe('Trained today');
  });

  it(`needs you after ${NEEDS_YOU_DAYS} days without a workout`, () => {
    const g = clientGlance(OLD_CLIENT, new Set(['2026-11-10']), TODAY, NOW);
    expect(g.daysSince).toBe(9);
    expect(g.needsYou).toBe(true);
    expect(g.label).toBe('Not trained 9 days');
  });

  it('does not flag a recent workout', () => {
    const g = clientGlance(OLD_CLIENT, new Set(['2026-11-15']), TODAY, NOW);
    expect(g.needsYou).toBe(false);
    expect(g.label).toBe('Last workout 4 days ago');
  });

  it('flags an established client with no workouts in the window', () => {
    const g = clientGlance(OLD_CLIENT, undefined, TODAY, NOW);
    expect(g.needsYou).toBe(true);
    expect(g.label).toBe('No workout in 30+ days');
  });

  it('does not flag a brand-new client who has not started', () => {
    const g = clientGlance({ id: 'n', joined_at: '2026-11-18T08:00:00Z' }, undefined, TODAY, NOW);
    expect(g.needsYou).toBe(false);
    expect(g.label).toBe('No workouts yet');
  });

  it('never flags a paused client', () => {
    const g = clientGlance({ ...OLD_CLIENT, paused_at: '2026-11-01' }, undefined, TODAY, NOW);
    expect(g.needsYou).toBe(false);
  });
});
