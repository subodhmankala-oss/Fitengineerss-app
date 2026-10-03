import { describe, it, expect } from 'vitest';
import { togglePick, pickTag, secondaryLabel, MAX_PICKS } from './multiPick';

describe('togglePick', () => {
  it('adds picks in order up to the max', () => {
    let r = togglePick([], 'fat_loss');
    expect(r).toEqual({ list: ['fat_loss'], full: false });
    r = togglePick(r.list, 'gut_repair');
    expect(r).toEqual({ list: ['fat_loss', 'gut_repair'], full: false });
    expect(MAX_PICKS).toBe(2);
  });

  it('refuses a third pick and says the list is full', () => {
    const r = togglePick(['fat_loss', 'gut_repair'], 'muscle_building');
    expect(r).toEqual({ list: ['fat_loss', 'gut_repair'], full: true });
  });

  it('tapping a picked item removes it; the other becomes the main pick', () => {
    expect(togglePick(['fat_loss', 'gut_repair'], 'fat_loss').list).toEqual(['gut_repair']);
    expect(togglePick(['fat_loss', 'gut_repair'], 'gut_repair').list).toEqual(['fat_loss']);
    expect(togglePick(['fat_loss'], 'fat_loss').list).toEqual([]);
  });

  it('a removed slot frees room for a new pick', () => {
    const removed = togglePick(['fat_loss', 'gut_repair'], 'gut_repair').list;
    expect(togglePick(removed, 'muscle_building').list).toEqual(['fat_loss', 'muscle_building']);
  });
});

describe('pickTag', () => {
  it('only tags once two are picked: Main then Also', () => {
    expect(pickTag(['a'], 'a')).toBeNull();
    expect(pickTag(['a', 'b'], 'a')).toBe('Main');
    expect(pickTag(['a', 'b'], 'b')).toBe('Also');
    expect(pickTag(['a', 'b'], 'c')).toBeNull();
  });
});

describe('secondaryLabel', () => {
  it('maps a saved slug to its label, empty for none/unknown', () => {
    const labels = { gut_repair: 'Gut Health' };
    expect(secondaryLabel('gut_repair', labels)).toBe('Gut Health');
    expect(secondaryLabel(null, labels)).toBe('');
    expect(secondaryLabel('nope', labels)).toBe('');
  });
});
