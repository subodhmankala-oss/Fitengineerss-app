// @vitest-environment jsdom
// Goal (step 2) and concern (step 4) each allow up to 2 picks; the first is
// the main one (program / primary_concern), the second is saved separately
// (secondary_program / secondary_concern).
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const db = vi.hoisted(() => ({
  saveClientOnboardingData: vi.fn(),
  getMyFounderMessages: vi.fn()
}));
vi.mock('../services/databaseService', () => ({ __esModule: true, default: db }));

import ClientOnboardingWizard from './ClientOnboardingWizard';

const type = (placeholder, value) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
const next = () => fireEvent.click(screen.getByRole('button', { name: /Next/ }));
const finish = () => fireEvent.click(screen.getByRole('button', { name: /Go to dashboard/ }));
const pick = (text) => fireEvent.click(screen.getByText(text));

function toStep2() {
  type('e.g. Priya Sharma', 'Asha');
  type('10-digit mobile number', '9876543210');
  type('e.g. 28', '29');
  type('e.g. 72', '72');
  type('e.g. 175', '175');
  next();
}

describe('ClientOnboardingWizard — pick up to 2', () => {
  beforeEach(() => {
    db.saveClientOnboardingData.mockResolvedValue(undefined);
    db.getMyFounderMessages.mockResolvedValue([]);
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('goal step: two picks are tagged Main then Also; a third is refused with a hint', () => {
    render(<ClientOnboardingWizard onComplete={() => {}} />);
    toStep2();
    expect(screen.getByText(/Pick up to 2/)).toBeTruthy();

    pick('Fat Loss');
    // One pick: no tags yet.
    expect(screen.queryByText('Main')).toBeNull();
    pick('Gut Repair');
    expect(screen.getByText('Main')).toBeTruthy();
    expect(screen.getByText('Also')).toBeTruthy();

    pick('Muscle Building');
    expect(screen.getByText('You can choose up to 2 — tap one to remove it first.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Muscle Building/ }).getAttribute('aria-pressed')).toBe('false');

    // Remove the main pick: the other becomes main, and there's room again.
    pick('Fat Loss');
    expect(screen.queryByText('Also')).toBeNull();
    pick('Muscle Building');
    expect(screen.queryByText('You can choose up to 2 — tap one to remove it first.')).toBeNull();
    expect(screen.getByRole('button', { name: /Muscle Building/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('still needs at least one goal', () => {
    render(<ClientOnboardingWizard onComplete={() => {}} />);
    toStep2();
    next();
    expect(screen.getByText('Please select a program to continue.')).toBeTruthy();
  });

  it('saves main + also for both goal and concern', async () => {
    render(<ClientOnboardingWizard onComplete={() => {}} />);
    toStep2();
    pick('Gut Repair');          // main
    pick('Fat Loss');            // also
    next();
    pick('Lightly Active');
    next();
    pick('Digestion issues');    // main
    pick('Just stay fit');       // also
    finish();
    await waitFor(() => expect(db.saveClientOnboardingData).toHaveBeenCalledTimes(1));
    expect(db.saveClientOnboardingData.mock.calls[0][0]).toMatchObject({
      program: 'gut_repair',
      secondary_program: 'fat_loss',
      primary_concern: 'digestion_issues',
      secondary_concern: 'just_stay_fit'
    });
  });

  it('one pick each saves with no second pick (null)', async () => {
    render(<ClientOnboardingWizard onComplete={() => {}} />);
    toStep2();
    pick('Muscle Building');
    next();
    pick('Moderately Active');
    next();
    pick('Bloating or constipation');
    finish();
    await waitFor(() => expect(db.saveClientOnboardingData).toHaveBeenCalledTimes(1));
    expect(db.saveClientOnboardingData.mock.calls[0][0]).toMatchObject({
      program: 'muscle_building',
      secondary_program: null,
      primary_concern: 'bloating_constipation',
      secondary_concern: null
    });
  });
});
