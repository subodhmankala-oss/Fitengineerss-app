import { describe, it, expect } from 'vitest';
import { lastWorkoutLine } from './clientHeaderLine';

const TODAY = '2026-11-24';
const s = (date, planName) => ({ date, planName });

describe('lastWorkoutLine', () => {
  it('names the latest workout whatever order the list is in', () => {
    expect(lastWorkoutLine([s('2026-11-20', 'Push'), s('2026-11-23', 'Legs'), s('2026-11-21', 'Pull')], TODAY))
      .toEqual({ name: 'Legs', when: 'yesterday' });
  });

  it('leaves out names nobody chose', () => {
    expect(lastWorkoutLine([s(TODAY, 'Custom Routine')], TODAY)).toEqual({ name: null, when: 'today' });
    expect(lastWorkoutLine([s(TODAY, 'Live Routine')], TODAY).name).toBeNull();
    expect(lastWorkoutLine([s(TODAY, null)], TODAY).name).toBeNull();
  });

  it('says how long ago in plain words', () => {
    const when = date => lastWorkoutLine([s(date, 'Legs')], TODAY).when;
    expect(when('2026-11-22')).toBe('2 days ago');
    expect(when('2026-11-17')).toBe('1 week ago');
    expect(when('2026-11-01')).toBe('3 weeks ago');
    expect(when('2026-08-01')).toBe('3 months ago');
  });

  it('is null with no workout, and ignores dates after today', () => {
    expect(lastWorkoutLine([], TODAY)).toBeNull();
    expect(lastWorkoutLine(undefined, TODAY)).toBeNull();
    expect(lastWorkoutLine([s('2026-11-25', 'Legs')], TODAY)).toBeNull();
  });
});
