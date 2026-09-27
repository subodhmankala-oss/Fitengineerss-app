// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Onboarding from './Onboarding';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// ResetPasswordPage stores this message and redirects to '/', where the
// login screen picks it up. From 2026-07-07 (0daa304) until this test, the
// effect that reads it called a setter removed along with client sign-up,
// throwing a ReferenceError that unmounted the whole app: every successful
// password reset ended on a blank white screen.
describe('Onboarding after a password reset', () => {
  it('shows the reset success message on the client login form', async () => {
    localStorage.setItem('resetSuccessMsg', 'Password updated. Log in with your new password.');
    render(<Onboarding onComplete={() => {}} />);
    expect(await screen.findByText(/Password updated\. Log in with your new password\./)).toBeTruthy();
    expect(localStorage.getItem('resetSuccessMsg')).toBeNull();
  });
});
