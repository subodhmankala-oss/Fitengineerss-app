import { describe, it, expect } from 'vitest';
import { isSuperAdmin, SUPER_ADMIN_EMAILS } from './accessControl';

describe('accessControl: isSuperAdmin helper', () => {
  it('should return true for configured admin emails', () => {
    expect(isSuperAdmin('subodhmankala@gmail.com')).toBe(true);
    expect(isSuperAdmin('manohar.mankala@gmail.com')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(isSuperAdmin('SubodhMankala@gmail.com')).toBe(true);
    expect(isSuperAdmin('MANOHAR.MANKALA@GMAIL.COM')).toBe(true);
  });

  it('should handle leading/trailing whitespaces', () => {
    expect(isSuperAdmin('  subodhmankala@gmail.com  ')).toBe(true);
    expect(isSuperAdmin('\tmanohar.mankala@gmail.com\n')).toBe(true);
  });

  it('should return false for regular coach and client emails', () => {
    expect(isSuperAdmin('trainer@fitengineers.com')).toBe(false);
    expect(isSuperAdmin('coach@fitengineers.com')).toBe(false);
    expect(isSuperAdmin('user@gmail.com')).toBe(false);
  });

  it('should return false for empty, null, or undefined values', () => {
    expect(isSuperAdmin('')).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
  });
});
