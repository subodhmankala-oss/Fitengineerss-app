// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Onboarding from './Onboarding';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// When automatic Google coach provisioning fails, App.jsx sets
// pendingCoachApply and the coach finishes on the Coach Sign Up form, which
// creates an active coach. There is no approval step (removed 2026-09-28), so
// this form is the whole fallback and must keep showing.
describe('Onboarding coach sign-up fallback', () => {
  it('shows the Coach Sign Up form when a coach sign-up is unfinished', () => {
    localStorage.setItem('pendingCoachApply', 'true');
    localStorage.setItem('userEmail', 'new-coach@example.com');
    render(<Onboarding onComplete={() => {}} />);
    expect(screen.getByText('Coach Sign Up')).toBeTruthy();
    expect(screen.queryByText(/pending|under review|approved/i)).toBeNull();
  });
});
