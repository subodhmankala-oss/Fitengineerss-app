import { describe, it, expect } from 'vitest';
import { hourSpan, peakTakeaway, trendLabel, monthName } from './gymView';

const empty = () => Array.from({ length: 7 }, () => new Array(24).fill(0));

describe('reports helpers', () => {
  it('formats hour spans', () => {
    expect(hourSpan(18)).toBe('6-8 PM');
    expect(hourSpan(11)).toBe('11 AM-1 PM');
    expect(hourSpan(6)).toBe('6-8 AM');
  });

  it('says busiest and quietest windows, per day', () => {
    const g = empty();
    for (let d = 0; d < 5; d += 1) { g[d][18] = 6; g[d][19] = 6; g[d][10] = 1; g[d][11] = 1; g[d][14] = 2; g[d][15] = 2; }
    g[5][9] = 4; g[5][10] = 4;
    expect(peakTakeaway(g, 100)).toMatch(/^Busiest: weekdays 6-8 PM; quietest: /);
  });

  it('gives no line with too little data or a flat grid', () => {
    expect(peakTakeaway(empty(), 2)).toBeNull();
    expect(peakTakeaway(empty(), 50)).toBeNull();
  });

  it('labels trends and months', () => {
    expect(trendLabel(12, 5)).toBe('+12%');
    expect(trendLabel(-8, 5)).toBe('-8%');
    expect(trendLabel(0, 5)).toBe('same');
    expect(trendLabel(null, 0)).toBe('new');
    expect(monthName('2026-11')).toBe('Nov 26');
  });
});
