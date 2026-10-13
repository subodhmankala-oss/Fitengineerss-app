// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../services/databaseService', () => {
  const svc = {
    getDefaultWorkoutTemplates: vi.fn().mockResolvedValue([]),
    getGenericWorkoutsByLevel: vi.fn().mockResolvedValue([]),
    getWorkoutPlansForUser: vi.fn().mockResolvedValue([]),
    getOwnCoachConnection: vi.fn().mockResolvedValue({ connected: false, resolved: true }),
    resolveUserId: vi.fn().mockResolvedValue('u1'),
    getWorkoutLogsForUser: vi.fn().mockResolvedValue([]),
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
    saveWorkoutSession: vi.fn().mockResolvedValue(undefined),
    saveWorkoutPlan: vi.fn().mockResolvedValue(undefined),
    getWorkoutDraft: vi.fn().mockResolvedValue(null),
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    BUILTIN_TEMPLATES: []
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});
vi.mock('../utils/pushNotify', () => ({ notifyEvent: vi.fn() }));

import WorkoutTracker from './WorkoutTracker';
import { TourProvider } from '../context/TourContext';
import { startLibraryProgram } from '../utils/startLibraryProgram';
import databaseService from '../services/databaseService';

Element.prototype.scrollTo = vi.fn();

describe('Library program with a cardio move (Incline Walk 12-3-30)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('logs the walk as distance + time with the 30 min target, not as reps', async () => {
    startLibraryProgram('u1', 'gym', 'beginner', {
      name: 'Beginner Incline Walk 12-3-30',
      exercises: [
        { name: 'Incline Walk', sets: 1, reps: '30 min' },
        { name: 'Dead Bug', sets: 3, reps: '10' },
        { name: 'Plank', sets: 3, reps: '30s' },
      ],
    });
    render(<TourProvider><WorkoutTracker /></TourProvider>);

    const card = (await screen.findAllByText('Incline Walk'))
      .map(el => el.closest('.hevy-exercise-card'))
      .find(Boolean);
    expect(card).toBeTruthy();
    expect(card.querySelector('.hevy-set-row--cardio')).not.toBeNull();
    expect(Array.from(card.querySelectorAll('.hevy-table-header span')).map(el => el.textContent.trim()).slice(0, 4))
      .toEqual(['SET', 'PREV', 'KM', 'TIME']);
    expect(card.querySelector('.cardio-time-input .set-value-placeholder').textContent).toBe('30:00');
  });

  it('a timed move shows its duration as the timer target (SkiErg 4 min → 04:00)', async () => {
    startLibraryProgram('u1', 'hyrox', 'advanced', {
      name: 'Hyrox Half Race Sim',
      exercises: [{ name: 'Running', sets: 8, reps: '500 m' }, { name: 'SkiErg', sets: 2, reps: '4 min' }],
    });
    render(<TourProvider><WorkoutTracker /></TourProvider>);
    const card = (await screen.findAllByText('SkiErg'))
      .map(el => el.closest('.hevy-exercise-card'))
      .find(Boolean);
    const placeholders = Array.from(card.querySelectorAll('.set-value-placeholder, input')).map(el => el.textContent || el.placeholder);
    expect(placeholders.filter(t => t === '04:00')).toHaveLength(2);
  });
});

describe('Workout Library Hyrox section', () => {
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('has a Hyrox button next to Gym and Home that loads the Hyrox programs', async () => {
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    localStorage.setItem('workoutTrackerLastTab_u1', 'templates');
    databaseService.getGenericWorkoutsByLevel.mockImplementation(async (level, category) => (
      category === 'hyrox' && level === 'beginner'
        ? [{ id: 'h1', name: 'Hyrox Starter', exercises: [{ name: 'Running', sets: 3, reps: '500 m' }] }]
        : []
    ));
    render(<TourProvider><WorkoutTracker /></TourProvider>);

    const buttons = Array.from(document.querySelectorAll('.wt-category-btn')).map(b => b.textContent);
    expect(buttons).toEqual(['🏋️ Gym', '🏠 Home', '🏁 Hyrox']);
    fireEvent.click(screen.getByText('🏁 Hyrox'));
    fireEvent.click(screen.getByText(/Beginner/, { selector: 'button.wt-level-tab' }));
    expect(await screen.findByText('Hyrox Starter')).toBeTruthy();
    expect(databaseService.getGenericWorkoutsByLevel).toHaveBeenCalledWith('beginner', 'hyrox');
    expect(localStorage.getItem('workoutTrackerLastCategory_u1')).toBe('hyrox');
  });
});

describe('Workout Library order', () => {
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('shows the newest programs first, so a new one is in the first four cards', async () => {
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
    localStorage.setItem('workoutTrackerLastTab_u1', 'templates');
    localStorage.setItem('workoutTrackerLastLevel_u1', 'intermediate');
    localStorage.setItem('workoutTrackerLastCategory_u1', 'gym');
    // As the database returns them: oldest first (created_at asc).
    const names = ['Intermediate Push', 'Intermediate Pull', 'Intermediate Legs', 'Intermediate Upper Body', 'Intermediate Core & Conditioning', 'Intermediate Zone 2 Cardio Base', 'Intermediate Lower'];
    databaseService.getGenericWorkoutsByLevel.mockImplementation(async (level, category) => (
      level === 'intermediate' && category === 'gym'
        ? names.map((name, i) => ({ id: `p${i}`, name, exercises: [{ name: 'Goblet Squat', sets: 3, reps: '10' }] }))
        : []
    ));
    render(<TourProvider><WorkoutTracker /></TourProvider>);

    await screen.findByText('Intermediate Lower');
    expect(Array.from(document.querySelectorAll('.wt-program-name')).map(el => el.textContent))
      .toEqual(['Intermediate Lower', 'Intermediate Zone 2 Cardio Base', 'Intermediate Core & Conditioning', 'Intermediate Upper Body']);
    expect(screen.getByText('Show all 7 programs')).toBeTruthy();
  });
});
