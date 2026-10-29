import { describe, it, expect } from 'vitest';
import { daysSinceWorkout, idleDecayPoints, decayWarningMessage } from './trainingLevelDecay';

const at = (d) => new Date(`${d}T09:00:00`);

describe('trainingLevelDecay', () => {
  it('counts whole idle days', () => {
    expect(daysSinceWorkout('2026-10-22', at('2026-10-29'))).toBe(7);
    expect(daysSinceWorkout(null, at('2026-10-29'))).toBeNull();
  });

  it('loses 1 point per full idle week', () => {
    expect(idleDecayPoints('2026-10-23', at('2026-10-29'))).toBe(0); // 6 days
    expect(idleDecayPoints('2026-10-22', at('2026-10-29'))).toBe(1); // 7 days
    expect(idleDecayPoints('2026-10-09', at('2026-10-29'))).toBe(2); // 20 days
    expect(idleDecayPoints('2026-10-08', at('2026-10-29'))).toBe(3); // 21 days
  });

  it('warns only on the day a point drops', () => {
    expect(decayWarningMessage('Asha', '2026-10-23', at('2026-10-29'))).toBeNull();
    expect(decayWarningMessage('Asha', '2026-10-22', at('2026-10-29')).title).toContain('dropped 1 point');
    expect(decayWarningMessage('Asha', '2026-10-21', at('2026-10-29'))).toBeNull();
    expect(decayWarningMessage('Asha', '2026-10-15', at('2026-10-29')).body).toContain('2 points');
  });
});
