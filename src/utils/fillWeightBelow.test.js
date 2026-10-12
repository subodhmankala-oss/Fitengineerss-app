import { describe, it, expect } from 'vitest';
import { fillWeightBelow, typedOverHint } from './fillWeightBelow';

const set = (weight, extra = {}) => ({ reps: 10, weight, isCompleted: false, ...extra });
const kgs = sets => sets.map(s => s.weight);

describe('fillWeightBelow', () => {
  it('fills the empty boxes below the edited set', () => {
    const sets = [set('5'), set(''), set('')];
    expect(kgs(fillWeightBelow(sets, 0, '5'))).toEqual(['5', '5', '5']);
  });

  it('follows later edits of the same box (5 -> 55) while the boxes below are untouched', () => {
    let sets = [set('5'), set(''), set('')];
    sets = fillWeightBelow(sets, 0, '5');
    sets = fillWeightBelow([{ ...sets[0], weight: '55' }, sets[1], sets[2]], 0, '55');
    expect(kgs(sets)).toEqual(['55', '55', '55']);
  });

  it('never overwrites a box the client typed, a PREV pre-fill or a ticked set', () => {
    const sets = [set('5'), set('8'), set('7.5', { weightFromPrev: true }), set('', { isCompleted: true })];
    expect(kgs(fillWeightBelow(sets, 0, '5'))).toEqual(['5', '8', '7.5', '']);
  });

  it('stops following once the client edits a filled box by hand', () => {
    let sets = fillWeightBelow([set('5'), set(''), set('')], 0, '5');
    sets = fillWeightBelow(sets.map((s, i) => (i === 1 ? { ...s, weight: '6' } : s)), 1, '6');
    expect(kgs(sets)).toEqual(['5', '6', '6']);
    sets = fillWeightBelow(sets.map((s, i) => (i === 0 ? { ...s, weight: '9' } : s)), 0, '9');
    expect(kgs(sets)).toEqual(['9', '6', '9']);
  });

  it('shows the filled boxes as dimmed hints', () => {
    const sets = fillWeightBelow([set('5'), set('')], 0, '5');
    expect(sets[1].weightFromPrev).toBe(true);
    expect(sets[0].weightFromPrev).toBeUndefined();
  });

  it('clearing the box clears what it filled', () => {
    let sets = fillWeightBelow([set('5'), set('')], 0, '5');
    sets = fillWeightBelow([{ ...sets[0], weight: '' }, sets[1]], 0, '');
    expect(kgs(sets)).toEqual(['', '']);
  });
});

describe('typedOverHint', () => {
  it('typing on a hint replaces it instead of appending', () => {
    expect(typedOverHint(set('5', { weightFromPrev: true }), '57')).toBe('7');
    expect(typedOverHint(set('12.5', { weightFromPrev: true }), '12.57')).toBe('7');
  });

  it('leaves a typed value, a backspace and a clear alone', () => {
    expect(typedOverHint(set('5'), '57')).toBe('57');
    expect(typedOverHint(set('5', { weightFromPrev: true }), '')).toBe('');
    expect(typedOverHint(set('', { weightFromPrev: true }), '7')).toBe('7');
  });
});
