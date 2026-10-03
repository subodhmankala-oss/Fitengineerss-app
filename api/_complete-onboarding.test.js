// The super-admin's "New client joined" alert says how the client will be
// guided — self-guided by the app, or by their coach — never "no coach".
import { describe, it, expect } from 'vitest';
import { newClientAlertBody, cleanSecondary } from './complete-onboarding.js';

describe('newClientAlertBody', () => {
  it('calls a coachless client self-guided', () => {
    expect(newClientAlertBody('Anusha', null, null)).toBe('Anusha signed up as a self-guided user.');
  });

  it('names the coach when there is one', () => {
    expect(newClientAlertBody('Lakku', 'coach-uuid', 'Subodh Mankala')).toBe('Lakku signed up with Coach Subodh Mankala.');
  });

  it('still reads well if the coach name lookup failed', () => {
    expect(newClientAlertBody('Lakku', 'coach-uuid', null)).toBe('Lakku signed up with their coach.');
  });
});

describe('cleanSecondary', () => {
  const PROGRAMS = ['fat_loss', 'muscle_building', 'gut_repair'];

  it('keeps a valid second pick', () => {
    expect(cleanSecondary('gut_repair', PROGRAMS, 'fat_loss')).toBe('gut_repair');
  });

  it('drops one that repeats the main pick, is unknown, or is missing', () => {
    expect(cleanSecondary('fat_loss', PROGRAMS, 'fat_loss')).toBeNull();
    expect(cleanSecondary('bogus', PROGRAMS, 'fat_loss')).toBeNull();
    expect(cleanSecondary(undefined, PROGRAMS, 'fat_loss')).toBeNull();
    expect(cleanSecondary(null, PROGRAMS, 'fat_loss')).toBeNull();
  });
});
