import { describe, it, expect } from 'vitest';
import { templateTargetTime } from './templateTargets';

describe('templateTargetTime', () => {
  it('turns a duration in minutes into an mm:ss target', () => {
    expect(templateTargetTime('30 min')).toBe('30:00');
    expect(templateTargetTime('40 min')).toBe('40:00');
    expect(templateTargetTime('5min')).toBe('05:00');
  });

  it('turns seconds into an mm:ss target (Plank 30s, SkiErg 90s)', () => {
    expect(templateTargetTime('30s')).toBe('00:30');
    expect(templateTargetTime('45 s')).toBe('00:45');
    expect(templateTargetTime('90s')).toBe('01:30');
    expect(templateTargetTime('4 min')).toBe('04:00');
  });

  it('has no time target for a distance, a rep count or nothing', () => {
    expect(templateTargetTime('1 km')).toBe('');
    expect(templateTargetTime('500 m')).toBe('');
    expect(templateTargetTime('12')).toBe('');
    expect(templateTargetTime(undefined)).toBe('');
    expect(templateTargetTime('')).toBe('');
  });
});
