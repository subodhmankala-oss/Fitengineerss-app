import { describe, it, expect } from 'vitest';
import { formatNoteDuration, buildSessionStatPhrase } from './liveWorkoutTimer';

describe('formatNoteDuration', () => {
  it('reads like speech, not a stopwatch', () => {
    expect(formatNoteDuration(2)).toBe('2 sec');
    expect(formatNoteDuration(45 * 60)).toBe('45 min');
    expect(formatNoteDuration(65 * 60)).toBe('1 h 5 min');
    expect(formatNoteDuration(2 * 3600)).toBe('2 h');
  });
});

describe('buildSessionStatPhrase', () => {
  it('joins duration and kcal with "and"', () => {
    expect(buildSessionStatPhrase(45 * 60, 320.4)).toBe('45 min and 320 kcal');
    expect(buildSessionStatPhrase(2, 1.46)).toBe('2 sec and 1.5 kcal');
  });
  it('skips missing parts', () => {
    expect(buildSessionStatPhrase(null, 200)).toBe('200 kcal');
    expect(buildSessionStatPhrase(600, null)).toBe('10 min');
    expect(buildSessionStatPhrase(null, null)).toBe('');
  });
});
