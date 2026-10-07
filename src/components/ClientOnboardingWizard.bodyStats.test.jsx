// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../services/databaseService', () => ({
  __esModule: true,
  default: {
    saveClientOnboardingData: vi.fn().mockResolvedValue(undefined),
    getMyFounderMessages: vi.fn().mockResolvedValue([])
  }
}));

import ClientOnboardingWizard from './ClientOnboardingWizard';

const type = (placeholder, value) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
const next = () => fireEvent.click(screen.getByRole('button', { name: /Next/ }));

describe('ClientOnboardingWizard step 1 body stats', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('blocks Next when weight, age, sex and height are left blank', () => {
    render(<ClientOnboardingWizard onComplete={() => {}} />);
    type('e.g. Priya Sharma', 'Asha');
    type('10-digit mobile number', '9876543210');
    next();
    expect(screen.getByText('Your Body Stats')).toBeTruthy();
    expect(screen.getByText(/your age \(10–100\), your sex, your weight in kg \(20–300\) and your height in cm \(100–250\)/)).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. 72').className).toContain('error');
  });

  it('rejects an out-of-range weight', () => {
    render(<ClientOnboardingWizard onComplete={() => {}} />);
    type('e.g. Priya Sharma', 'Asha');
    type('10-digit mobile number', '9876543210');
    type('e.g. 28', '29');
    fireEvent.click(screen.getByRole('radio', { name: 'Male' }));
    type('e.g. 72', '7');
    type('e.g. 175', '162');
    next();
    expect(screen.getByText('Please enter your weight in kg (20–300).')).toBeTruthy();
  });

  it('moves on once all six fields are valid', () => {
    render(<ClientOnboardingWizard onComplete={() => {}} />);
    type('e.g. Priya Sharma', 'Asha');
    type('10-digit mobile number', '9876543210');
    type('e.g. 28', '29');
    fireEvent.click(screen.getByRole('radio', { name: 'Female' }));
    type('e.g. 72', '64.5');
    type('e.g. 175', '162');
    next();
    expect(screen.getByText('Select Your Program')).toBeTruthy();
  });
});

describe('ClientOnboardingWizard sex picker', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('blocks Next until a sex is picked and marks only one option selected', () => {
    render(<ClientOnboardingWizard onComplete={() => {}} />);
    type('e.g. Priya Sharma', 'Asha');
    type('10-digit mobile number', '9876543210');
    type('e.g. 28', '29');
    type('e.g. 72', '64.5');
    type('e.g. 175', '162');
    next();
    expect(screen.getByText('Please enter your sex.')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Female' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Male' }));
    expect(screen.getByRole('radio', { name: 'Male' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Female' }).getAttribute('aria-checked')).toBe('false');
    next();
    expect(screen.getByText('Select Your Program')).toBeTruthy();
  });
});
