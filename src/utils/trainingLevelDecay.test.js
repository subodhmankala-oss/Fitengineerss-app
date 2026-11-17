import { describe, it, expect } from 'vitest';
import { daysSinceWorkout, idleDays, idleDecayPoints, decayWarningMessage } from './trainingLevelDecay';

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

  describe('with a break', () => {
    // Away 23–27 Oct (back on the 28th): 5 days that don't count.
    const breaks = [{ startDate: '2026-10-23', backDate: '2026-10-28' }];

    it('skips break days when counting idle weeks', () => {
      expect(idleDays('2026-10-20', at('2026-10-29'), breaks)).toBe(4);
      expect(idleDecayPoints('2026-10-20', at('2026-10-29'), breaks)).toBe(0); // 9 days, 5 on break
      expect(idleDecayPoints('2026-10-20', at('2026-11-01'), breaks)).toBe(1); // 12 days, 7 idle
    });

    it('moves the warning to the 7th idle day', () => {
      expect(decayWarningMessage('Asha', '2026-10-20', at('2026-10-27'), breaks)).toBeNull();
      expect(decayWarningMessage('Asha', '2026-10-20', at('2026-11-01'), breaks).title).toContain('dropped 1 point');
    });

    it('never warns on a break day', () => {
      // 7 idle days are done before the break; day 8 onwards is the break.
      const later = [{ startDate: '2026-10-27', backDate: '2026-11-05' }];
      expect(decayWarningMessage('Asha', '2026-10-20', at('2026-10-27'), later)).toBeNull();
    });

    it('a workout after the break is unaffected', () => {
      expect(idleDays('2026-10-28', at('2026-10-29'), breaks)).toBe(1);
    });
  });
});
