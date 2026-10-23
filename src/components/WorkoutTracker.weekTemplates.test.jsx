// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// Same isolated data layer as WorkoutTracker.oneTap.test.jsx.
vi.mock('../services/databaseService', () => {
  const svc = {
    getDefaultWorkoutTemplates: vi.fn().mockResolvedValue([]),
    getGenericWorkoutsByLevel: vi.fn().mockResolvedValue([]),
    getWorkoutPlansForUser: vi.fn().mockResolvedValue([]),
    getOwnCoachConnection: vi.fn().mockResolvedValue({ connected: false }),
    resolveUserId: vi.fn().mockResolvedValue('u1'),
    getWorkoutLogsForUser: vi.fn().mockResolvedValue([]),
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
    saveWorkoutSession: vi.fn().mockResolvedValue(undefined),
    saveWorkoutPlan: vi.fn().mockResolvedValue(undefined),
    getWorkoutDraft: vi.fn().mockResolvedValue(null),
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    deleteWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    BUILTIN_TEMPLATES: []
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});

vi.mock('../utils/alarmSound', () => ({ playAlarmBeeps: vi.fn(), unlockAudio: vi.fn() }));

import databaseService from '../services/databaseService';
import WorkoutTracker from './WorkoutTracker';
import { TourProvider } from '../context/TourContext';

const renderWorkoutTracker = () => render(<TourProvider><WorkoutTracker /></TourProvider>);

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('WorkoutTracker routine picker templates', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    localStorage.setItem('workoutTrackerLastTab_u1', 'log');
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('always pins Push / Pull / Leg Day, and starts one with its exercises', async () => {
    renderWorkoutTracker();
    expect(await screen.findByText('Push Day')).toBeTruthy();
    expect(screen.getByText('Pull Day')).toBeTruthy();
    expect(screen.getByText('Leg Day')).toBeTruthy();
    expect(screen.getAllByText('Starter plan')).toHaveLength(3);

    const pushCard = screen.getByText('Push Day').closest('.wt-plan-card');
    fireEvent.click(pushCard.querySelector('.wt-plan-start-btn'));
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    expect(screen.getAllByText('Bench Press (Barbell)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Triceps Pushdown').length).toBeGreaterThan(0);
  });

  it('offers Push / Pull / Legs and this week in the Existing Plan dropdown', async () => {
    databaseService.getWorkoutLogsForUser.mockResolvedValue([
      { log_date: daysAgo(1), plan_name: 'Arms Blast', exercise_name: 'Bicep Curl (Dumbbell)', set_number: 1, reps: 12, weight_kg: 10 },
      { log_date: daysAgo(30), plan_name: 'Leg Day', exercise_name: 'Leg Press', set_number: 1, reps: 10, weight_kg: 80 }
    ]);
    renderWorkoutTracker();
    await screen.findByText('Arms Blast');
    fireEvent.click(screen.getByText('Start Empty Workout'));
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();

    const select = document.querySelector('select');
    const groups = [...select.querySelectorAll('optgroup')].map(g => g.label);
    expect(groups.slice(0, 2)).toEqual(['Push / Pull / Legs', 'This week']);
    expect([...select.options].map(o => o.textContent)).toContain('Leg Day');

    fireEvent.change(select, { target: { value: 'core:legs' } });
    expect((await screen.findAllByText('Leg Press')).length).toBeGreaterThan(0);
    // kg pre-filled from the client's last Leg Press, not left blank.
    expect(screen.getAllByRole('button', { name: '80' }).length).toBeGreaterThan(0);
  });

  it('lists this week\'s workouts but not older ones', async () => {
    databaseService.getWorkoutLogsForUser.mockResolvedValue([
      { log_date: daysAgo(2), plan_name: 'Arms Blast', exercise_name: 'Bicep Curl (Dumbbell)', set_number: 1, reps: 12, weight_kg: 10 },
      { log_date: daysAgo(10), plan_name: 'Old Session', exercise_name: 'Leg Press', set_number: 1, reps: 10, weight_kg: 80 }
    ]);
    renderWorkoutTracker();
    expect(await screen.findByText('Arms Blast')).toBeTruthy();
    expect(screen.queryByText('Old Session')).toBeNull();
  });
});
