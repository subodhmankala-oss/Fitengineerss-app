import { describe, it, expect } from 'vitest';
import { hasValidPhone } from './coachPhone';

describe('hasValidPhone', () => {
  it('accepts a stored +91 number and a bare 10-digit number', () => {
    expect(hasValidPhone('+919876543210')).toBe(true);
    expect(hasValidPhone('98765 43210')).toBe(true);
  });

  it('rejects empty, missing and short numbers', () => {
    expect(hasValidPhone('')).toBe(false);
    expect(hasValidPhone(null)).toBe(false);
    expect(hasValidPhone(undefined)).toBe(false);
    expect(hasValidPhone('+91 12345')).toBe(false);
  });
});
