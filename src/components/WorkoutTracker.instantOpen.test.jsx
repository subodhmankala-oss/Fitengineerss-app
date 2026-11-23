// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';

// A server that never answers the "is a workout open?" / plans reads, so
// anything on screen here came up without waiting for it.
const slow = vi.hoisted(() => ({ draft: null, logs: null }));
vi.mock('../services/databaseService', () => {
  const never = () => new Promise(() => {});
  const svc = {
    getDefaultWorkoutTemplates: vi.fn().mockResolvedValue([]),
    getGenericWorkoutsByLevel: vi.fn().mockResolvedValue([]),
    getWorkoutPlansForUser: vi.fn(never),
    getOwnCoachConnection: vi.fn().mockResolvedValue({ connected: false }),
    resolveUserId: vi.fn().mockResolvedValue('u1'),
    getWorkoutLogsForUser: vi.fn(() => new Promise(r => { slow.logs = r; })),
    getExerciseLibrary: vi.fn().mockResolvedValue([]),
    saveWorkoutSession: vi.fn().mockResolvedValue(undefined),
    saveWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    deleteWorkoutDraft: vi.fn().mockResolvedValue(undefined),
    getWorkoutDraft: vi.fn(() => new Promise(r => { slow.draft = r; })),
    saveWorkoutPlan: vi.fn().mockResolvedValue(undefined),
    BUILTIN_TEMPLATES: [],
  };
  return { __esModule: true, default: svc, isTrainer: () => false };
});

import WorkoutTracker from './WorkoutTracker';
import { queueWorkoutAdd } from '../utils/pendingWorkoutAdds';
import { rememberOpenDraft, clearOpenDraft, forgetDiscardedDraft } from '../utils/openDraftHandoff';
import { rememberSavedWorkout } from '../utils/savedWorkoutGuard';
import { getLocalDateString } from '../utils/dateUtils';

const exerciseNames = () => Array.from(document.querySelectorAll('.ex-name-clickable')).map(n => n.textContent);
const openDraft = (over = {}) => ({
  userId: 'u1', coachId: null, source: 'self', planName: 'Upper Body', logDate: getLocalDateString(),
  exercises: [{ name: 'Biceps Curls', sets: [{ reps: 15, weight: '2.5', isCompleted: true, completedAt: Date.now() - 5000 }] }],
  timerStatus: 'running', timerStartedAt: Date.now() - 60000, pauseIntervals: [], updatedAt: new Date().toISOString(),
  ...over,
});

describe('the logger opens on tap, before the server answers', () => {
  beforeEach(() => {
    localStorage.clear();
    clearOpenDraft();
    localStorage.setItem('userName', 'TestClient');
    localStorage.setItem('userId', 'u1');
  });
  afterEach(cleanup);

  it('resumes the open workout Home already read', () => {
    rememberOpenDraft('u1', openDraft());
    render(<WorkoutTracker />);
    expect(exerciseNames()).toEqual(['Biceps Curls']);
  });

  it('does not bring back a saved, discarded or coach-run workout, or another account’s', () => {
    const saved = openDraft({ timerStartedAt: 111 });
    rememberSavedWorkout('self', 111);
    rememberOpenDraft('u1', saved);
    render(<WorkoutTracker />);
    expect(exerciseNames()).toEqual([]);
    cleanup();

    forgetDiscardedDraft(222);
    rememberOpenDraft('u1', openDraft({ timerStartedAt: 222 }));
    render(<WorkoutTracker />);
    expect(exerciseNames()).toEqual([]);
    cleanup();

    rememberOpenDraft('u1', openDraft({ source: 'coach' }));
    render(<WorkoutTracker />);
    expect(exerciseNames()).toEqual([]);
    cleanup();

    rememberOpenDraft('u2', openDraft());
    render(<WorkoutTracker />);
    expect(exerciseNames()).toEqual([]);
  });

  it('starts a coach plan from the Home card', () => {
    localStorage.setItem('workoutTrackerAutoStart_u1', JSON.stringify({
      coachPlanId: 'p1',
      coachPlan: { id: 'p1', planName: 'Push Day', createdBy: 'coach', exercises: [{ name: 'Biceps Curls', sets: [{ reps: 12, weight: '5' }] }] },
    }));
    render(<WorkoutTracker />);
    expect(exerciseNames()).toContain('Biceps Curls');
    expect(localStorage.getItem('wt_opened_coach_plan_ids_u1')).toContain('p1');
  });

  it('starts queued exercises when Home found nothing open, and fills last time’s sets in after', async () => {
    rememberOpenDraft('u1', null);
    queueWorkoutAdd('Biceps Curls');
    render(<WorkoutTracker />);
    await waitFor(() => expect(exerciseNames()).toContain('Biceps Curls'));

    await act(async () => {
      slow.logs([1, 2, 3].map(n => ({
        id: `r${n}`, log_date: '2026-08-01', exercise_name: 'Biceps Curls', set_number: n, reps: 12, weight_kg: 7.5,
        created_at: '2026-08-01T10:00:00Z', session_id: 's1', plan_name: 'Arms',
      })));
    });
    const card = Array.from(document.querySelectorAll('.hevy-exercise-card')).find(c => c.textContent.includes('Biceps Curls'));
    await waitFor(() => expect(card.querySelectorAll('.col-weight .set-value-display, .col-weight button, .col-weight [role="button"]').length).toBeGreaterThan(0));
    const draft = JSON.parse(localStorage.getItem('workoutDraft_u1'));
    const sets = draft.logExercises.find(e => e.name === 'Biceps Curls').sets;
    expect(sets.map(s => [Number(s.reps), Number(s.weight)])).toEqual([[12, 7.5], [12, 7.5], [12, 7.5]]);
  });

  it('moves them into a workout that turns out to be open on the server', async () => {
    rememberOpenDraft('u1', null);
    queueWorkoutAdd('External Rotation (Cable)');
    render(<WorkoutTracker />);
    await waitFor(() => expect(exerciseNames()).toContain('External Rotation (Cable)'));
    await act(async () => { slow.draft(openDraft()); });
    expect(exerciseNames()).toEqual(['Biceps Curls', 'External Rotation (Cable)']);
  });

  it('keeps what is on screen when the slow read returns this same session', async () => {
    rememberOpenDraft('u1', null);
    queueWorkoutAdd('Biceps Curls');
    render(<WorkoutTracker />);
    await waitFor(() => expect(localStorage.getItem('workoutDraft_u1')).toBeTruthy());
    const start = JSON.parse(localStorage.getItem('workoutDraft_u1')).workoutTimerStartedAt;
    await act(async () => { slow.draft(openDraft({ timerStartedAt: start, exercises: [{ name: 'Plank', sets: [] }] })); });
    expect(exerciseNames()).toContain('Biceps Curls');
    expect(exerciseNames()).not.toContain('Plank');
  });

  it('shows the opening placeholder, never Progress, when it does have to wait', () => {
    queueWorkoutAdd('Biceps Curls'); // Home hadn't heard back yet
    render(<WorkoutTracker />);
    expect(screen.getByTestId('opening-logger')).toBeTruthy();
    expect(screen.queryByText('Strength Progression', { exact: false })).toBeNull();
  });
});
