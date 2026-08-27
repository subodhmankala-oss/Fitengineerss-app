import { describe, it, expect } from 'vitest';
import { computeRestSecondsRemaining } from './liveWorkoutTimer';

describe('computeRestSecondsRemaining', () => {
  it('returns 0 when there is no end timestamp', () => {
    expect(computeRestSecondsRemaining(null)).toBe(0);
    expect(computeRestSecondsRemaining(undefined)).toBe(0);
  });

  it('returns the ceil of remaining ms as seconds while the rest is in progress', () => {
    const now = 1_000_000;
    // 59.5s remaining -> ceil to 60
    expect(computeRestSecondsRemaining(now + 59_500, now)).toBe(60);
    // exactly 30s remaining
    expect(computeRestSecondsRemaining(now + 30_000, now)).toBe(30);
  });

  it('never goes negative once restEndAt has passed', () => {
    const now = 1_000_000;
    expect(computeRestSecondsRemaining(now - 5_000, now)).toBe(0);
  });

  // This is the actual bug being fixed: a screen locked/tab backgrounded for
  // a long stretch used to leave a tick-decremented counter reading way too
  // high (it only counted the setInterval ticks that got to run). Deriving
  // remaining time from the fixed end timestamp instead means an arbitrarily
  // long gap (5 minutes here, standing in for "screen was off") still reads
  // the correct remaining time the instant it's checked again.
  it('reflects real elapsed time across a long gap, not ticks that ran', () => {
    const restStartedAt = 1_000_000;
    const restEndAt = restStartedAt + 60_000; // 60s rest
    const muchLater = restStartedAt + 5 * 60_000; // 5 minutes later, e.g. screen was locked
    expect(computeRestSecondsRemaining(restEndAt, muchLater)).toBe(0);
  });
});
