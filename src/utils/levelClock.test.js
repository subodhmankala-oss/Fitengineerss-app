import { describe, it, expect } from 'vitest';
import { levelClock, RULE_FROM } from './levelClock';
import { trainingLevelFor } from './clientTrainingLevel';
import { determineWorkoutGuidance, levelProgress } from './beginnerGuidance';
import { shiftLocalDateString } from './dateUtils';

const START = '2027-01-04'; // a Monday, after the rule began
const day = (n) => shiftLocalDateString(START, n);
// Workouts on days 0, every, 2×every, … up to `to`.
const steady = (to, every = 2, from = 0) => {
  const out = [];
  for (let n = from; n <= to; n += every) out.push(day(n));
  return out;
};
const clock = (dates, todayN, breaks) => levelClock({ start: START, dates, breaks, today: day(todayN) });

describe('levelClock', () => {
  it('training all along is the calendar', () => {
    expect(clock(steady(40), 40)).toEqual({ days: 40, lost: 0 });
  });

  it('once a week loses nothing, even on the day before the next workout', () => {
    expect(clock(steady(63, 7), 70).days).toBe(70);
    expect(clock([...steady(63, 7), day(70)], 70).days).toBe(70);
  });

  it('6 full days off changes nothing, 7 takes the week and 3 days', () => {
    const until = steady(24); // last workout on day 24
    expect(clock(until, 31)).toEqual({ days: 31, lost: 0 });
    expect(clock(until, 32)).toEqual({ days: 22, lost: 3 });
  });

  it('day 24, then 3 weeks away: 9 days back, week 3 (24 − 9, plus the day they return)', () => {
    const dates = [...steady(24), day(46)];
    expect(clock(dates, 46)).toEqual({ days: 16, lost: 9 });
  });

  it('keeps counting once back, and the drop leaves the bar after a week', () => {
    const dates = [...steady(24), ...steady(60, 2, 46)];
    expect(clock(dates, 52)).toEqual({ days: 22, lost: 9 });
    expect(clock(dates, 53)).toEqual({ days: 23, lost: 0 });
  });

  it('two times away each take theirs', () => {
    const dates = [...steady(30), day(39), ...steady(50, 2, 41)]; // 8 full days off
    expect(clock([...dates, day(59)], 59).days).toBe(59 - 10 - 10);
  });

  it('a break pauses it and takes nothing back', () => {
    const breaks = [{ startDate: day(25), backDate: day(46) }];
    expect(clock([...steady(24), day(46)], 46, breaks)).toEqual({ days: 25, lost: 0 });
    // Still away after the break ended: only those days are idle.
    expect(clock(steady(24), 55, breaks)).toEqual({ days: 24 + 10 - 10, lost: 3 });
  });

  it('never below the start, and only what was there can be lost', () => {
    expect(clock([day(1)], 80)).toEqual({ days: 0, lost: 1 });
    expect(clock([], 80)).toEqual({ days: 0, lost: 0 });
  });

  it('a level that was reached is not lost', () => {
    const dates = steady(88); // 4 days into the second level
    expect(clock(dates, 300).days).toBeGreaterThanOrEqual(84);
    expect(clock(dates, 300).lost).toBe(4);
  });

  it('never drops to a lower level from one day to the next', () => {
    const dates = [...steady(80), ...steady(130, 3, 110)];
    let level = 0;
    for (let n = 1; n <= 160; n += 1) {
      const now = Math.floor(clock(dates.filter(d => d <= day(n)), n).days / 84);
      expect(now).toBeGreaterThanOrEqual(level);
      level = now;
    }
  });

  it('before the rule it was the calendar; a level held by then is kept', () => {
    expect(levelClock({ start: '2026-08-01', dates: ['2026-08-01'], today: '2026-11-20' }).days).toBe(111);
    const after = levelClock({ start: '2026-08-01', dates: ['2026-08-01'], today: RULE_FROM });
    expect(after.days).toBe(84);
    // Under a level by then: time away already taken off.
    expect(levelClock({ start: '2026-10-30', dates: ['2026-10-31', '2026-11-25'], today: '2026-11-25' }).days).toBe(0);
  });

  it('ignores copies, order and workouts before the clock started', () => {
    expect(clock([day(4), day(2), day(4), day(-30)], 5)).toEqual({ days: 5, lost: 0 });
    expect(levelClock({ start: null, dates: [], today: day(1) })).toEqual({ days: 0, lost: 0 });
  });
});

describe('every screen follows the same clock', () => {
  const library = { gym: Object.fromEntries(['beginner', 'intermediate', 'advanced'].map(l => [l, [{ name: `${l} A`, exercises: [] }]])), home: {} };
  const pref = { level: 'beginner', category: 'gym', since: START };
  const at = (n) => new Date(`${day(n)}T12:00:00`);
  const both = (dates, n, breaks = []) => [
    determineWorkoutGuidance(library, dates.map(date => ({ date, planName: 'x' })), at(n), pref, breaks).level,
    trainingLevelFor({ profile: null, pref }, dates.map(log_date => ({ log_date })), breaks, at(n))
  ];

  it('training all along: Intermediate on day 84', () => {
    expect(both(steady(84), 83)).toEqual(['beginner', 'beginner']);
    expect(both(steady(84), 84)).toEqual(['intermediate', 'intermediate']);
  });

  it('3 weeks away moves it later, for the programs and the targets alike', () => {
    const dates = [...steady(24), ...steady(120, 2, 46)];
    expect(both(dates, 84)).toEqual(['beginner', 'beginner']);
    expect(both(dates, 113)).toEqual(['beginner', 'beginner']);
    expect(both(dates, 114)).toEqual(['intermediate', 'intermediate']);
  });

  it('with no level chosen, from the first workout', () => {
    const dates = [...steady(24), ...steady(120, 2, 46)];
    const sessions = dates.map(date => ({ date, planName: 'x' }));
    expect(levelProgress('beginner', sessions, at(46))).toEqual({ week: 3, lost: 9 });
    expect(trainingLevelFor({ profile: null, pref: null }, dates.map(log_date => ({ log_date })), [], at(113))).toBe('beginner');
    expect(trainingLevelFor(null, dates.map(log_date => ({ log_date })), null, at(114))).toBe('intermediate');
  });

  it('the experience level a coach saved still wins', () => {
    expect(trainingLevelFor({ profile: { experienceLevel: 'advanced' }, pref }, [], [], at(200))).toBe('advanced');
  });
});
