import { describe, it, expect } from 'vitest';
import { calculateTargetsGeneric } from './targets';

describe('calculateTargetsGeneric sex constant (Mifflin-St Jeor)', () => {
  // 70 kg, 175 cm, 30 y, Sedentary (x1.2), maintenance: BMR before the sex
  // constant = 700 + 1093.75 - 150 = 1643.75
  const kcal = (sex) => calculateTargetsGeneric(70, 175, 30, 'Sedentary', 'General Fitness', sex).calories;

  it('uses +5 for men and -161 for women', () => {
    expect(kcal('male')).toBe(Math.round((1643.75 + 5) * 1.2));
    expect(kcal('female')).toBe(Math.round((1643.75 - 161) * 1.2));
  });

  it('keeps the old average (-78) when no sex is saved yet', () => {
    expect(kcal(undefined)).toBe(Math.round((1643.75 - 78) * 1.2));
    expect(kcal('')).toBe(kcal(undefined));
  });
});
