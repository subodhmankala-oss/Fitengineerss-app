import { describe, it, expect } from 'vitest';
import { warmupsFirst } from './warmupsFirst';

const work = name => ({ name, sets: [{ reps: '10', isCompleted: false }] });
const warm = name => ({ name, sets: [{ reps: '10', isWarmup: true, setType: 'warmup', isCompleted: false }] });
const names = list => list.map(ex => ex.name);

describe('warmupsFirst', () => {
  it('moves warm-ups to the top, keeping each group in order', () => {
    const list = [work('Leg Raise'), warm('Arm Circle'), work('Chest Fly'), warm('Leg Swing'), work('Row')];
    expect(names(warmupsFirst(list))).toEqual(['Arm Circle', 'Leg Swing', 'Leg Raise', 'Chest Fly', 'Row']);
  });

  it('catches a warm-up by name even when its sets are not tagged', () => {
    expect(names(warmupsFirst([work('Squat'), work('Arm Circle')]))).toEqual(['Arm Circle', 'Squat']);
  });

  it('leaves a session that is already in order, or has no warm-ups, as is', () => {
    const ordered = [warm('Leg Swing'), work('Squat')];
    expect(warmupsFirst(ordered)).toEqual(ordered);
    const none = [work('Squat'), work('Row')];
    expect(warmupsFirst(none)).toBe(none);
  });
});
