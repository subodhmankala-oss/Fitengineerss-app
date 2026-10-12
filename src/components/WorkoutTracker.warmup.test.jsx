// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

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
import databaseService from '../services/databaseService';
import { TourProvider } from '../context/TourContext';
import { startLibraryProgram } from '../utils/startLibraryProgram';
import { WARMUP_BLOCKS, getWarmupWeekIndex, buildWarmupExercises } from '../utils/warmupBlocks';
import { applyWeeklySwaps } from '../utils/weeklySwaps';

Element.prototype.scrollTo = vi.fn();

const program = (name, ...exercises) => ({ name, exercises: exercises.map(n => ({ name: n, sets: 3, reps: '10' })) });

// Exercise card titles in the logger, top to bottom.
const cardTitles = () => Array.from(document.querySelectorAll('h5')).map(el => el.textContent.trim());

describe('Workout Library program opens with the weekly warm-up block', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
  });
  afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

  it('gym upper day: this week’s 3 warm-ups first, then the program with this week’s swaps', async () => {
    const push = program('Intermediate Push', 'Bench Press', 'Overhead Press (Dumbbell)', 'Incline Dumbbell Press', 'Cable Fly', 'Triceps Pushdown');
    startLibraryProgram('u1', 'gym', 'intermediate', push);
    render(<TourProvider><WorkoutTracker /></TourProvider>);

    const expected = WARMUP_BLOCKS.upper.gym[getWarmupWeekIndex(new Date())].map(i => i.name);
    const thisWeek = applyWeeklySwaps({ programName: push.name, exercises: push.exercises, level: 'intermediate', category: 'gym' });
    const all = [...expected, ...thisWeek.map(e => e.name)];
    for (const name of all) {
      expect((await screen.findAllByText(name)).length).toBeGreaterThan(0);
    }
    expect(cardTitles().filter(t => all.includes(t))).toEqual(all);
    // Never logged before, so no made-up weight: the kg box is empty.
    const benchCard = Array.from(document.querySelectorAll('h5')).find(h => h.textContent.trim() === 'Bench Press').closest('.hevy-exercise-card');
    expect(benchCard.querySelector('.col-weight .set-value-placeholder')?.textContent).toBe('kg');
    // The 2 swapped exercises say what they replace.
    expect(Array.from(document.querySelectorAll('.swap-caption')).map(el => el.textContent))
      .toEqual(thisWeek.filter(e => e.swappedFrom).map(e => `🔄 New this week · instead of ${e.swappedFrom}`));
    // Warm-up sets carry the "W" label, and each card says it's a warm-up.
    expect(document.querySelectorAll('.set-num-lbl.warmup').length).toBeGreaterThanOrEqual(3);
    expect(Array.from(document.querySelectorAll('.warmup-caption')).map(el => el.textContent))
      .toEqual(['🔥 Warm-up 1 of 3 · go light, about 5 min', '🔥 Warm-up 2 of 3', '🔥 Warm-up 3 of 3']);
  });

  it('home day uses the home block, and never repeats an exercise', async () => {
    // A week whose home lower block has Glute Bridge, which this program
    // already contains — the warm-up must use a stand-in instead.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 5, 9, 0));
    try {
      const lower = program('Home Intermediate Lower Body', 'Jump Squat', 'Bulgarian Split Squat', 'Reverse Lunge', 'Glute Bridge', 'Wall Sit');
      startLibraryProgram('u1', 'home', 'intermediate', lower);
      render(<TourProvider><WorkoutTracker /></TourProvider>);

      const thisWeek = applyWeeklySwaps({ programName: lower.name, exercises: lower.exercises, level: 'intermediate', category: 'home' });
      const warmups = buildWarmupExercises({ programName: lower.name, exercises: thisWeek, category: 'home' }).map(e => e.name);
      expect(warmups).toHaveLength(3);
      const all = [...warmups, ...thisWeek.map(e => e.name)];
      for (const name of all) {
        expect((await screen.findAllByText(name)).length).toBeGreaterThan(0);
      }
      expect(cardTitles().filter(t => all.includes(t))).toEqual(all);
      expect(new Set(all).size).toBe(all.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it('adds one finisher for a neglected muscle that fits the day, once the history loads', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 12, 9, 0));
    try {
      // Everything a legs day can take trained recently except calves (20 days ago).
      const row = (log_date, exercise_name) => ({ log_date, exercise_name, reps: 10, weight_kg: 20, set_type: null, plan_name: 'x', created_at: `${log_date}T08:00:00Z` });
      databaseService.getWorkoutLogsForUser.mockResolvedValueOnce([
        row('2026-10-10', 'Bench Press'), row('2026-10-10', 'Shoulder Press (Dumbbell)'), row('2026-10-10', 'Plank'),
        row('2026-10-08', 'Barbell Squat'), row('2026-10-08', 'Romanian Deadlift'), row('2026-10-08', 'Hip Thrust'),
        row('2026-09-22', 'Standing Calf Raise'),
      ]);
      const legs = program('Intermediate Legs', 'Barbell Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl (Seated)');
      startLibraryProgram('u1', 'gym', 'intermediate', legs);
      render(<TourProvider><WorkoutTracker /></TourProvider>);

      expect(await screen.findByText('🎯 Finisher · Calves not trained in 20 days')).toBeTruthy();
      expect(cardTitles().at(-1)).toBe('Standing Calf Raise');
      expect(cardTitles().filter(t => t === 'Standing Calf Raise')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
