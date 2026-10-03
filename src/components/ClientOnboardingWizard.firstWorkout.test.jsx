// @vitest-environment jsdom
// After the sign-up answers save, the wizard asks Gym or Home and starts the
// first Beginner library program instead of dropping the client on the
// dashboard (FirstWorkoutPicker).
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const gymA = { name: 'Beginner Full Body A', exercises: [{ name: 'Goblet Squat' }, { name: 'Push-up' }, { name: 'Row' }] };
const homeA = { name: 'Home Beginner Full Body A', exercises: [{ name: 'Squat' }, { name: 'Plank' }] };
const gymInt = { name: 'Intermediate Push', exercises: [{ name: 'Bench Press' }] };
const LIB = { gym: { beginner: [gymA], intermediate: [gymInt], advanced: [] }, home: { beginner: [homeA], intermediate: [], advanced: [] } };

const db = vi.hoisted(() => ({
  saveClientOnboardingData: vi.fn(),
  getMyFounderMessages: vi.fn(),
  getGenericWorkoutsByLevel: vi.fn()
}));
vi.mock('../services/databaseService', () => ({ __esModule: true, default: db }));

import ClientOnboardingWizard from './ClientOnboardingWizard';

const type = (placeholder, value) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));

async function finishSignUp(onComplete) {
  render(<ClientOnboardingWizard onComplete={onComplete} />);
  type('e.g. Priya Sharma', 'Rahul Naik');
  type('10-digit mobile number', '9876543210');
  type('e.g. 28', '29');
  type('e.g. 72', '72');
  type('e.g. 175', '175');
  click(/Next/);
  fireEvent.click(screen.getByText('Fat Loss'));
  click(/Next/);
  fireEvent.click(screen.getByText('Lightly Active'));
  click(/Next/);
  fireEvent.click(screen.getByText('Just stay fit'));
  click(/Next/);
  await screen.findByText('You’re all set, Rahul!');
}

describe('ClientOnboardingWizard → first workout', () => {
  beforeEach(() => {
    localStorage.setItem('userId', 'u1');
    db.saveClientOnboardingData.mockResolvedValue(undefined);
    db.getMyFounderMessages.mockResolvedValue([]);
    db.getGenericWorkoutsByLevel.mockImplementation(async (level, category) => LIB[category][level]);
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('saves the answers first, then asks gym or home instead of leaving', async () => {
    const onComplete = vi.fn();
    await finishSignUp(onComplete);
    expect(db.saveClientOnboardingData).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(await screen.findByText('At the gym')).toBeTruthy();
    expect(screen.getByText('Beginner Full Body A · 3 exercises')).toBeTruthy();
    expect(screen.getByText('Home Beginner Full Body A · 2 exercises')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pick gym or home' }).disabled).toBe(true);
  });

  it('starting queues the program for the Workouts tab and opens it', async () => {
    const onComplete = vi.fn();
    await finishSignUp(onComplete);
    fireEvent.click(await screen.findByText('At home'));
    click('Start my first workout 💪');
    expect(onComplete).toHaveBeenCalledWith({ startWorkout: true });
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'))).toEqual({
      name: 'Home Beginner Full Body A', exercises: homeA.exercises, level: 'beginner'
    });
    expect(localStorage.getItem('workoutTrackerLastCategory_u1')).toBe('home');
    // Skip the spotlight tour — they're already doing what it teaches.
    expect(localStorage.getItem('clientTourSeen')).toBe('true');
  });

  it('"I’ll start later" goes to the dashboard without queuing anything', async () => {
    const onComplete = vi.fn();
    await finishSignUp(onComplete);
    click('I’ll start later');
    expect(onComplete).toHaveBeenCalledWith();
    expect(localStorage.getItem('workoutTrackerAutoStart_u1')).toBeNull();
    expect(localStorage.getItem('clientTourSeen')).toBeNull();
  });

  it('Beginner is pre-selected; picking a level shows and starts that level’s program', async () => {
    const onComplete = vi.fn();
    await finishSignUp(onComplete);
    await screen.findByText('What’s your level?');
    expect(screen.getByRole('radio', { name: 'Beginner' }).getAttribute('aria-checked')).toBe('true');
    // No Advanced programs in this library → no Advanced button.
    expect(screen.queryByRole('radio', { name: 'Advanced' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Intermediate' }));
    expect(screen.getByText('Training regularly for 6+ months')).toBeTruthy();
    expect(screen.getByText('Intermediate Push · 1 exercise')).toBeTruthy();
    // No Intermediate home program → only the gym card.
    expect(screen.queryByText('At home')).toBeNull();

    fireEvent.click(screen.getByText('At the gym'));
    click('Start my first workout 💪');
    expect(onComplete).toHaveBeenCalledWith({ startWorkout: true });
    expect(JSON.parse(localStorage.getItem('workoutTrackerAutoStart_u1'))).toMatchObject({ name: 'Intermediate Push', level: 'intermediate' });
    expect(localStorage.getItem('workoutTrackerLastLevel_u1')).toBe('intermediate');
  });

  it('switching level drops a gym/home pick that level doesn’t have', async () => {
    await finishSignUp(vi.fn());
    fireEvent.click(await screen.findByText('At home'));
    fireEvent.click(screen.getByRole('radio', { name: 'Intermediate' }));
    expect(screen.getByRole('button', { name: 'Pick gym or home' }).disabled).toBe(true);
  });

  it('falls back to "Go to dashboard" if the library can’t load', async () => {
    db.getGenericWorkoutsByLevel.mockResolvedValue([]);
    const onComplete = vi.fn();
    await finishSignUp(onComplete);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Go to dashboard 🚀' })).toBeTruthy());
    expect(screen.queryByText('At the gym')).toBeNull();
    click('Go to dashboard 🚀');
    expect(onComplete).toHaveBeenCalledWith();
  });

  it('a failed save keeps them on step 4 with the error (no first-workout screen)', async () => {
    db.saveClientOnboardingData.mockRejectedValue(new Error('Network down'));
    render(<ClientOnboardingWizard onComplete={() => {}} />);
    type('e.g. Priya Sharma', 'Rahul');
    type('10-digit mobile number', '9876543210');
    type('e.g. 28', '29');
    type('e.g. 72', '72');
    type('e.g. 175', '175');
    click(/Next/);
    fireEvent.click(screen.getByText('Fat Loss'));
    click(/Next/);
    fireEvent.click(screen.getByText('Lightly Active'));
    click(/Next/);
    fireEvent.click(screen.getByText('Just stay fit'));
    click(/Next/);
    expect(await screen.findByText('Network down')).toBeTruthy();
    expect(screen.queryByText(/You’re all set/)).toBeNull();
  });
});
