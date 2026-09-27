import { describe, it, expect } from 'vitest';
import {
  buildComebackWorkout,
  daysSinceLastWorkout,
  exercisesFromLastWorkout,
  COMEBACK_WORKOUT_NAME,
} from './comebackWorkout';

const row = (log_date, exercise_name, set_number, reps, extra = {}) => ({
  log_date, exercise_name, set_number, reps, weight_kg: 20, ...extra,
});

describe('daysSinceLastWorkout', () => {
  it('is null with no logs', () => {
    expect(daysSinceLastWorkout([], '2026-09-27')).toBeNull();
    expect(daysSinceLastWorkout(null, '2026-09-27')).toBeNull();
  });

  it('counts whole days from the most recent log_date', () => {
    const logs = [row('2026-09-10', 'Squat', 1, 10), row('2026-09-20', 'Squat', 1, 10)];
    expect(daysSinceLastWorkout(logs, '2026-09-27')).toBe(7);
    expect(daysSinceLastWorkout(logs, '2026-09-20')).toBe(0);
  });

  it('counts across a month boundary', () => {
    expect(daysSinceLastWorkout([row('2026-08-30', 'Squat', 1, 10)], '2026-09-02')).toBe(3);
  });
});

describe('exercisesFromLastWorkout', () => {
  it('takes the first 3 exercises of the latest day, 2 sets each, in order', () => {
    const logs = [
      row('2026-09-01', 'Deadlift', 1, 5, { session_row: 0 }),
      row('2026-09-05', 'Bench Press', 1, 8, { session_row: 0 }),
      row('2026-09-05', 'Bench Press', 2, 6, { session_row: 1 }),
      row('2026-09-05', 'Barbell Row', 1, 10, { session_row: 2 }),
      row('2026-09-05', 'Shoulders Press', 1, 12, { session_row: 3 }),
      row('2026-09-05', 'Biceps Curls', 1, 15, { session_row: 4 }),
    ];
    expect(exercisesFromLastWorkout(logs)).toEqual([
      { name: 'Bench Press', sets: 2, reps: '8' },
      { name: 'Barbell Row', sets: 2, reps: '10' },
      { name: 'Shoulders Press', sets: 2, reps: '12' },
    ]);
  });

  it('skips warm-ups and cardio', () => {
    const logs = [
      row('2026-09-05', 'Arm Circle', 1, 10, { session_row: 0 }),
      row('2026-09-05', 'Leg Swing', 1, 10, { session_row: 1 }),
      row('2026-09-05', 'Treadmill', 1, 0, { session_row: 2, distance_km: 2 }),
      row('2026-09-05', 'Cable Fly', 1, 12, { session_row: 3, set_type: 'warmup' }),
      row('2026-09-05', 'Squat', 1, 10, { session_row: 4 }),
      row('2026-09-05', 'Lunge', 1, 12, { session_row: 5 }),
    ];
    expect(exercisesFromLastWorkout(logs).map(e => e.name)).toEqual(['Squat', 'Lunge']);
  });

  it('uses the last day that had strength work, not a cardio-only day', () => {
    const logs = [
      row('2026-09-01', 'Squat', 1, 10),
      row('2026-09-01', 'Push Up', 1, 12),
      row('2026-09-06', 'Running', 1, 0, { cardio_duration_seconds: 1200 }),
    ];
    expect(exercisesFromLastWorkout(logs).map(e => e.name)).toEqual(['Squat', 'Push Up']);
  });
});

describe('buildComebackWorkout', () => {
  const homeBeginner = {
    name: 'Home Beginner Full Body A',
    exercises: [
      { name: 'Squat', reps: '12', sets: 3 },
      { name: 'Push Up', reps: '10', sets: 3 },
      { name: 'Glute Bridge', reps: '15', sets: 3 },
      { name: 'Plank', reps: '30s', sets: 3 },
    ],
  };

  it('builds from the client’s last workout when there is one', () => {
    const logs = [row('2026-09-05', 'Bench Press', 1, 8), row('2026-09-05', 'Barbell Row', 1, 10)];
    const workout = buildComebackWorkout(logs, homeBeginner);
    expect(workout.name).toBe(COMEBACK_WORKOUT_NAME);
    expect(workout.exercises.map(e => e.name)).toEqual(['Bench Press', 'Barbell Row']);
  });

  it('falls back to the Home Beginner program, trimmed to 3 x 2 sets', () => {
    expect(buildComebackWorkout([], homeBeginner).exercises).toEqual([
      { name: 'Squat', sets: 2, reps: '12' },
      { name: 'Push Up', sets: 2, reps: '10' },
      { name: 'Glute Bridge', sets: 2, reps: '15' },
    ]);
  });

  it('falls back when history has only one usable exercise', () => {
    const logs = [row('2026-09-05', 'Bench Press', 1, 8)];
    expect(buildComebackWorkout(logs, homeBeginner).exercises[0].name).toBe('Squat');
  });

  it('is null with no history and no fallback', () => {
    expect(buildComebackWorkout([], null)).toBeNull();
  });
});
