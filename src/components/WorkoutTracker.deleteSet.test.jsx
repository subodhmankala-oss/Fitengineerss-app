// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

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

import WorkoutTracker from './WorkoutTracker';

const renderWorkoutTracker = () => render(<WorkoutTracker />);

// No jest-dom in this project — plain className check instead of toHaveClass.
const hasClass = (el, cls) => el.className.split(/\s+/).includes(cls);

const DRAFT_KEY = 'workoutDraft_u1';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const threeSetDraft = () => ({
  isLoggingWorkout: true,
  logExercises: [{
    name: 'Bench Press',
    sets: [
      { reps: 10, weight: '40', isCompleted: false },
      { reps: 9, weight: '42.5', isCompleted: false },
      { reps: 8, weight: '45', isCompleted: false }
    ]
  }],
  logClient: 'TestClient',
  logDate: today(),
  templateName: 'Push Day',
  activeTemplateName: 'Push Day',
  saveAsTemplate: false,
  workoutTimerStatus: 'idle',
  workoutTimerStartedAt: null,
  workoutPauseIntervals: [],
  savedAt: Date.now()
});

describe('WorkoutTracker delete set', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('deleting the top set removes only that one — the row that takes its place stays fully visible and clickable', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(threeSetDraft()));
    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    expect(screen.getAllByTitle('Change set type').length).toBe(3);

    // The row bin is gone (rows lift and drop now); the set-type menu's
    // Remove Set is the tap path to the same removal.
    fireEvent.click(screen.getAllByTitle('Change set type')[0]);
    fireEvent.click(await screen.findByText('Remove Set'));

    // jsdom never fires animationend for a real CSS animation, so removal
    // here falls back to useExitingSetRow's safety timer (900ms) — a
    // generous timeout on top of that since a busy full-suite run can delay
    // real setTimeout callbacks well past their nominal delay.
    await waitFor(() => expect(screen.queryByRole('button', { name: '40' })).toBeNull(), { timeout: 5000 });

    // Exactly one set gone — the other two are still here...
    expect(screen.getByRole('button', { name: '42.5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '45' })).toBeTruthy();
    expect(screen.getAllByTitle('Change set type').length).toBe(2);
    // ...and the row that shifted into the top slot isn't stuck wearing the
    // OLD top row's exit styling (the "ghost row" bug: deleting row 1 left
    // row 2's DOM node — reused via React's index-based key — permanently
    // collapsed/unclickable because the exit class had been added straight
    // to the DOM outside React's own reconciliation).
    const newTopRow = screen.getByRole('button', { name: '42.5' }).closest('.hevy-set-row');
    expect(hasClass(newTopRow, 'set-row-exit')).toBe(false);
  });

  it('holding a set row lifts it; dropping on the bin removes the set and Undo puts it back', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(threeSetDraft()));
    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    const row = screen.getByRole('button', { name: '40' }).closest('.hevy-set-row');

    fireEvent.pointerDown(row, { pointerId: 1, clientX: 10, clientY: 10, button: 0 });
    await waitFor(() => expect(hasClass(row, 'set-row-lifted')).toBe(true));
    expect(document.querySelector('.set-lift-bin.is-on')).toBeTruthy();
    // jsdom lays everything out at 0,0, so any pointer position is "over" the bin.
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 10, clientY: 40 });
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 10, clientY: 40 });

    await waitFor(() => expect(screen.queryByRole('button', { name: '40' })).toBeNull());
    expect(screen.getAllByTitle('Change set type').length).toBe(2);
    expect(screen.getByText('Set removed')).toBeTruthy();

    await new Promise((r) => setTimeout(r, 100));
    fireEvent.click(screen.getByText('Undo'));
    await waitFor(() => expect(screen.getByRole('button', { name: '40' })).toBeTruthy());
    expect(screen.getAllByTitle('Change set type').length).toBe(3);
    // Back in its original top slot.
    const firstRow = document.querySelector('.hevy-table-body .hevy-set-row');
    expect(firstRow.contains(screen.getByRole('button', { name: '40' }))).toBe(true);
  });

  it('a quick tap on a row never lifts it', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(threeSetDraft()));
    renderWorkoutTracker();
    expect(await screen.findByText("🏋️ Today's Workout")).toBeTruthy();
    const row = screen.getByRole('button', { name: '40' }).closest('.hevy-set-row');
    fireEvent.pointerDown(row, { pointerId: 1, clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 10, clientY: 10 });
    await new Promise((r) => setTimeout(r, 400));
    expect(hasClass(row, 'set-row-lifted')).toBe(false);
    expect(document.querySelector('.set-lift-bin.is-on')).toBeNull();
  });
});
