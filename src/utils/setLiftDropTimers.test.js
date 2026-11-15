import { describe, it, expect } from 'vitest';
import { remapSetTimersForSetInsert, remapSetTimersForSetMove, moveItem } from './liveWorkoutTimer';

describe('lift and drop timer remaps', () => {
  it('insert shifts timers at and after the index, leaves others', () => {
    const t = { '0,0': 'a', '0,1': 'b', '0,2': 'c', '1,1': 'x' };
    expect(remapSetTimersForSetInsert(0, 1, t)).toEqual({ '0,0': 'a', '0,2': 'b', '0,3': 'c', '1,1': 'x' });
  });

  it('move down: moved timer follows, in-between sets shift up', () => {
    const t = { '0,0': 'a', '0,1': 'b', '0,2': 'c', '0,3': 'd' };
    expect(remapSetTimersForSetMove(0, 0, 2, t)).toEqual({ '0,2': 'a', '0,0': 'b', '0,1': 'c', '0,3': 'd' });
  });

  it('move up: moved timer follows, in-between sets shift down', () => {
    const t = { '0,0': 'a', '0,1': 'b', '0,2': 'c', '2,0': 'z' };
    expect(remapSetTimersForSetMove(0, 2, 0, t)).toEqual({ '0,0': 'c', '0,1': 'a', '0,2': 'b', '2,0': 'z' });
  });

  it('moveItem matches the timer remap order', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });
});
