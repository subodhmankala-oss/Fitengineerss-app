import { describe, it, expect } from 'vitest';
import { weekRanges, weekLabels, weeksBeforeJoin, plural, busiestSummary } from './ownerView';

describe('weekRanges', () => {
  it('labels each 7-day block as a range ending today, oldest first', () => {
    // 2026-10-16 is a Friday; the newest block is 10–16 Oct.
    expect(weekRanges('2026-10-16', 3)).toEqual(['26 Sep – 2 Oct', '3–9 Oct', '10–16 Oct']);
  });
  it('writes both months when a block crosses a month end', () => {
    expect(weekRanges('2026-09-03', 1)).toEqual(['28 Aug – 3 Sep']);
  });
  it('lines up with the axis labels (each range starts on the axis date)', () => {
    const labels = weekLabels('2026-10-16', 4);
    const ranges = weekRanges('2026-10-16', 4);
    labels.forEach((l, i) => expect(ranges[i].startsWith(l.split(' ')[0])).toBe(true));
  });
});

describe('weeksBeforeJoin', () => {
  it('counts the oldest weeks that ended before the member joined', () => {
    // joined 2026-10-05 → blocks ending 25 Sep and 2 Oct are before; 9 Oct is not
    expect(weeksBeforeJoin('2026-10-16', 4, '2026-10-05T10:00:00Z')).toBe(2);
  });
  it('is 0 for someone who joined before the chart starts, or with no join date', () => {
    expect(weeksBeforeJoin('2026-10-16', 12, '2026-01-01T00:00:00Z')).toBe(0);
    expect(weeksBeforeJoin('2026-10-16', 12, null)).toBe(0);
  });
  it('the week they joined in is NOT before', () => {
    expect(weeksBeforeJoin('2026-10-16', 3, '2026-10-12T00:00:00Z')).toBe(2);
  });
});

describe('plural', () => {
  it('says 1 workout, 0 / 3 workouts', () => {
    expect(plural(1, 'workouts')).toBe('1 workout');
    expect(plural(0, 'workouts')).toBe('0 workouts');
    expect(plural(3, 'workouts')).toBe('3 workouts');
    expect(plural(1, 'members')).toBe('1 member');
  });
});

describe('busiestSummary', () => {
  const grid = (cells) => {
    const g = Array.from({ length: 7 }, () => new Array(24).fill(0));
    cells.forEach(([d, h, n]) => { g[d][h] = n; });
    return g;
  };
  it('names the busiest time of day and the busiest weekday separately', () => {
    expect(busiestSummary(grid([[2, 18, 6], [0, 18, 3], [2, 7, 2]]))).toBe('Busiest time: Evening (5–8 pm) · Busiest day: Wednesday');
  });
  it('says nothing with too little data', () => {
    expect(busiestSummary(grid([[0, 18, 2]]))).toBeNull();
  });
});
