// @vitest-environment jsdom
// The goal step allows up to 2 picks; the first is the main one (program),
// the second is saved separately (secondary_program). The wizard is 3 steps
// — the old "Primary Concern" step was removed (nothing read the answer).
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

describe('ClientOnboardingWizard — goal: pick up to 2, three steps', () => {
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

  it('is three steps: activity level is the last, with the save button, and there is no concern step', () => {
    render(<ClientOnboardingWizard onComplete={() => {}} />);
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    toStep2();
    expect(screen.getByText('Step 2 of 3')).toBeTruthy();
    pick('Fat Loss');
    next();
    expect(screen.getByText('Step 3 of 3')).toBeTruthy();
    expect(screen.getByText('Activity Level')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Go to dashboard/ })).toBeTruthy();
    expect(screen.queryByText('Primary Concern')).toBeNull();
  });

  it('the last step still needs an activity level before saving', () => {
    render(<ClientOnboardingWizard onComplete={() => {}} />);
    toStep2();
    pick('Fat Loss');
    next();
    finish();
    expect(screen.getByText('Please select your activity level to continue.')).toBeTruthy();
    expect(db.saveClientOnboardingData).not.toHaveBeenCalled();
  });

  it('saves main + also goals, and no concern', async () => {
    const onComplete = vi.fn();
    render(<ClientOnboardingWizard onComplete={onComplete} />);
    toStep2();
    pick('Gut Repair');          // main
    pick('Fat Loss');            // also
    next();
    pick('Lightly Active');
    finish();
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    const payload = db.saveClientOnboardingData.mock.calls[0][0];
    expect(payload).toMatchObject({
      program: 'gut_repair',
      secondary_program: 'fat_loss',
      activity_level: 'lightly_active'
    });
    expect(payload).not.toHaveProperty('primary_concern');
    expect(payload).not.toHaveProperty('secondary_concern');
  });

  it('one goal saves with no second goal (null)', async () => {
    render(<ClientOnboardingWizard onComplete={() => {}} />);
    toStep2();
    pick('Muscle Building');
    next();
    pick('Moderately Active');
    finish();
    await waitFor(() => expect(db.saveClientOnboardingData).toHaveBeenCalledTimes(1));
    expect(db.saveClientOnboardingData.mock.calls[0][0]).toMatchObject({
      program: 'muscle_building',
      secondary_program: null
    });
  });
});
