import { describe, it, expect } from 'vitest';
import { kgToDisplayWeight, displayWeightToKg } from './weightUnits';

describe('weight units', () => {
  it('stores pounds as kilograms (180 lbs is not 180 kg)', () => {
    expect(displayWeightToKg('180', 'lbs')).toBe('81.65');
  });

  it('shows stored kg in pounds when Pounds is selected', () => {
    expect(kgToDisplayWeight('81.65', 'lbs')).toBe('180');
    expect(kgToDisplayWeight('70', 'lbs')).toBe('154.3');
  });

  it('round-trips a pounds entry back to the same number', () => {
    ['150', '180', '212.5'].forEach(lbs => {
      expect(kgToDisplayWeight(displayWeightToKg(lbs, 'lbs'), 'lbs')).toBe(String(parseFloat(lbs)));
    });
  });

  it('leaves kilograms untouched', () => {
    expect(displayWeightToKg('72.5', 'kg')).toBe('72.5');
    expect(kgToDisplayWeight('72.5', 'kg')).toBe('72.5');
  });

  it('keeps an empty field empty', () => {
    expect(displayWeightToKg('', 'lbs')).toBe('');
    expect(kgToDisplayWeight('', 'lbs')).toBe('');
    expect(kgToDisplayWeight(null, 'kg')).toBe('');
  });
});
