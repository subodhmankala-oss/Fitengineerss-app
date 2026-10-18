import { describe, it, expect } from 'vitest';
import { visitGrid, dayStreak, memberTag, rankTrainers, initials } from './gymView';

describe('gymView', () => {
  it('marks the days trained, oldest first', () => {
    const g = visitGrid(['2026-10-18', '2026-10-16'], '2026-10-18', 4);
    expect(g).toEqual([false, true, false, true]);
  });
  it('counts a streak back from today', () => {
    expect(dayStreak(['2026-10-18', '2026-10-17', '2026-10-16', '2026-10-14'], '2026-10-18')).toBe(3);
  });
  it('does not zero the streak just because today is not trained yet', () => {
    expect(dayStreak(['2026-10-17', '2026-10-16'], '2026-10-18')).toBe(2);
  });
  it('is 0 when they last trained 2+ days ago', () => {
    expect(dayStreak(['2026-10-15'], '2026-10-18')).toBe(0);
  });
  it('tags members by training health', () => {
    expect(memberTag({ engagement: { status: 'quiet' } }).label).toBe('Stopped coming');
    expect(memberTag({ engagement: { status: 'thriving' } }).action).toBe('High-five');
  });
  it('ranks trainers by share still training', () => {
    const t = (id, pct, n) => ({ id, clientCount: n, stats: { activePct: pct } });
    expect(rankTrainers([t('a', 50, 4), t('b', 90, 2), t('c', null, 0)]).map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('makes initials', () => {
    expect(initials('Rahul Kumar')).toBe('RK');
    expect(initials('Asha')).toBe('A');
  });
});
