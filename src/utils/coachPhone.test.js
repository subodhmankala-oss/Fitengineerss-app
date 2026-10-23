import { describe, it, expect } from 'vitest';
import { hasValidPhone, mobileDigits } from './coachPhone';

describe('hasValidPhone', () => {
  it('accepts real-looking Indian mobiles in every stored shape', () => {
    expect(hasValidPhone('+919812345670')).toBe(true);
    expect(hasValidPhone('98123 45670')).toBe(true);
    expect(hasValidPhone('6299721564')).toBe(true);
    expect(hasValidPhone('09666251493')).toBe(true);
  });

  it('rejects empty, short and long numbers', () => {
    expect(hasValidPhone('')).toBe(false);
    expect(hasValidPhone(null)).toBe(false);
    expect(hasValidPhone(undefined)).toBe(false);
    expect(hasValidPhone('+91 98765')).toBe(false);
    expect(hasValidPhone('98765432101')).toBe(false);
  });

  it('rejects numbers that cannot be an Indian mobile', () => {
    expect(hasValidPhone('+911234567890')).toBe(false);
    expect(hasValidPhone('5876543210')).toBe(false);
    expect(hasValidPhone('9999999999')).toBe(false);
    expect(hasValidPhone('9876543210')).toBe(false);
  });
});

describe('mobileDigits', () => {
  it('strips the +91 / 0 prefix', () => {
    expect(mobileDigits('+91 98765 43210')).toBe('9876543210');
    expect(mobileDigits('09876543210')).toBe('9876543210');
    expect(mobileDigits('123')).toBe('');
  });
});
