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
import { TourProvider } from '../context/TourContext';
import { startLibraryProgram } from '../utils/startLibraryProgram';
import { WARMUP_BLOCKS, getWarmupWeekIndex } from '../utils/warmupBlocks';

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

  it('gym upper day: this week’s 3 warm-ups first, then the program', async () => {
    startLibraryProgram('u1', 'gym', 'intermediate', program('Intermediate Push', 'Bench Press', 'Cable Fly'));
    render(<TourProvider><WorkoutTracker /></TourProvider>);

    const expected = WARMUP_BLOCKS.upper.gym[getWarmupWeekIndex(new Date())].map(i => i.name);
    for (const name of [...expected, 'Bench Press', 'Cable Fly']) {
      expect((await screen.findAllByText(name)).length).toBeGreaterThan(0);
    }
    expect(cardTitles().filter(t => [...expected, 'Bench Press', 'Cable Fly'].includes(t)))
      .toEqual([...expected, 'Bench Press', 'Cable Fly']);
    // Warm-up sets carry the "W" label, and each card says it's a warm-up.
    expect(document.querySelectorAll('.set-num-lbl.warmup').length).toBeGreaterThanOrEqual(3);
    expect(Array.from(document.querySelectorAll('.warmup-strip-label')).map(el => el.textContent))
      .toEqual(['🔥 Warm-up 1 of 3', '🔥 Warm-up 2 of 3', '🔥 Warm-up 3 of 3']);
    expect(screen.getByText(/Go light, about 5 min/)).toBeTruthy();
  });

  it('home day uses the home block', async () => {
    startLibraryProgram('u1', 'home', 'intermediate', program('Home Intermediate Lower Body', 'Jump Squat', 'Bulgarian Split Squat', 'Reverse Lunge', 'Glute Bridge', 'Wall Sit'));
    render(<TourProvider><WorkoutTracker /></TourProvider>);

    const block = WARMUP_BLOCKS.lower.home[getWarmupWeekIndex(new Date())].map(i => i.name);
    // Glute Bridge is already in the program, so it is swapped out of the warm-up.
    for (const name of block.filter(n => n !== 'Glute Bridge')) {
      expect((await screen.findAllByText(name)).length).toBeGreaterThan(0);
    }
    expect(cardTitles().filter(t => t === 'Glute Bridge')).toHaveLength(1);
    expect(cardTitles().slice(0, 3)).toHaveLength(3);
    expect(cardTitles().slice(0, 3)).not.toContain('Glute Bridge');
  });
});
