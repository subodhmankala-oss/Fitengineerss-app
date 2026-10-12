import { describe, it, expect } from 'vitest';
import { FINISHERS, pickNeglectedFinisher, sessionsToLogRows } from './neglectedFinisher';
import { getMuscleGroupsForExercise } from './muscleGroups';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';

const known = new Set(EXERCISE_LIBRARY.map(e => e.name.toLowerCase()));
const CATALOG_ONLY = ['push up', 'hammer curl'];

const NOW = new Date(2026, 9, 12, 9, 0);
const day = (n) => { const d = new Date(2026, 9, 12 - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const session = (daysAgo, ...names) => ({ clientName: 'tc', date: day(daysAgo), exercises: names.map(name => ({ name, sets: [{ reps: '10', weight: '20' }] })) });
const ex = (...names) => names.map(name => ({ name, sets: 3, reps: '10' }));

// Trains everything regularly except calves and biceps.
const history = [
  session(2, 'Bench Press', 'Barbell Row', 'Shoulder Press (Dumbbell)', 'Triceps Pushdown', 'Wrist Curl', 'Plank'),
  session(4, 'Barbell Squat', 'Romanian Deadlift', 'Hip Thrust', 'Leg Press'),
  session(20, 'Standing Calf Raise', 'Barbell Curl'),
];

describe('FINISHERS', () => {
  it('every pick is a known exercise that really trains its muscle', () => {
    ['gym', 'home'].forEach(place => Object.entries(FINISHERS[place]).forEach(([muscle, picks]) => picks.forEach(p => {
      expect(known.has(p.name.toLowerCase()) || CATALOG_ONLY.includes(p.name.toLowerCase()), p.name).toBe(true);
      expect(getMuscleGroupsForExercise(p.name), `${p.name} → ${muscle}`).toContain(muscle);
    })));
  });
});

describe('pickNeglectedFinisher', () => {
  it('lower day: adds the longest-neglected leg muscle (calves, 20 days)', () => {
    const out = pickNeglectedFinisher({ programName: 'Intermediate Legs', exercises: ex('Barbell Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl (Seated)'), category: 'gym', sessions: history, clientName: 'tc', now: NOW });
    expect(out).toEqual({ name: 'Standing Calf Raise', sets: 2, reps: '15', finisherFor: { muscle: 'Calves', daysSince: 20 } });
  });

  it('upper day: skips calves (not an upper muscle) and picks an upper one', () => {
    // Back and biceps last trained 20 days ago (Barbell Row works both), same as calves.
    const upperHistory = [
      session(2, 'Bench Press', 'Shoulder Press (Dumbbell)', 'Triceps Pushdown', 'Wrist Curl', 'Plank'),
      history[1],
      session(20, 'Standing Calf Raise', 'Barbell Row'),
    ];
    const out = pickNeglectedFinisher({ programName: 'Intermediate Push', exercises: ex('Bench Press', 'Overhead Press (Dumbbell)', 'Cable Fly', 'Triceps Pushdown'), category: 'gym', sessions: upperHistory, clientName: 'tc', now: NOW });
    expect(out).toMatchObject({ name: 'Lat Pulldown', finisherFor: { muscle: 'Back', daysSince: 20 } });
  });

  it('skips a muscle the program already trains today', () => {
    const out = pickNeglectedFinisher({ programName: 'Intermediate Pull', exercises: ex('Barbell Row', 'Lat Pulldown', 'Hammer Curl'), category: 'gym', sessions: history, clientName: 'tc', now: NOW });
    expect(out).toBeNull();
  });

  it('no finisher on core / conditioning days', () => {
    expect(pickNeglectedFinisher({ programName: 'Intermediate Core & Conditioning', exercises: ex('Kettlebell Swing', 'Russian Twist'), category: 'gym', sessions: history, clientName: 'tc', now: NOW })).toBeNull();
  });

  it('no finisher until the client has 3 logged sessions', () => {
    expect(pickNeglectedFinisher({ programName: 'Intermediate Legs', exercises: ex('Barbell Squat'), category: 'gym', sessions: history.slice(0, 2), clientName: 'tc', now: NOW })).toBeNull();
  });

  it('home: only equipment-free picks, and never one already in the session', () => {
    const out = pickNeglectedFinisher({ programName: 'Home Intermediate Lower Body', exercises: ex('Jump Squat', 'Bulgarian Split Squat', 'Reverse Lunge', 'Glute Bridge', 'Wall Sit'), category: 'home', sessions: history, clientName: 'tc', takenNames: ['Calf Raise'], now: NOW });
    expect(out).toMatchObject({ name: 'Standing Calf Raise', finisherFor: { muscle: 'Calves' } });
  });

  it('warm-up sets never count as training a muscle', () => {
    const rows = sessionsToLogRows([{ clientName: 'tc', date: day(1), exercises: [{ name: 'Glute Bridge', sets: [{ reps: '15', isWarmup: true }] }] }], 'tc');
    expect(rows).toEqual([{ exercise_name: 'Glute Bridge', log_date: day(1), set_type: 'warmup' }]);
  });
});
