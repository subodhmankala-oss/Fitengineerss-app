// The super-admin's "New client joined" alert says how the client will be
// guided — self-guided by the app, or by their coach — never "no coach".
import { describe, it, expect } from 'vitest';
import { newClientAlertBody } from './complete-onboarding.js';

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
