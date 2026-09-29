import { describe, it, expect } from 'vitest';
import { computeRestSecondsRemaining, computeLiveCalories, estimateCardioKcal, estimateCardioDistanceKm, isJumpRopeExercise, isIsolationLift } from './liveWorkoutTimer';
import { isBodyweightExercise } from '../data/exerciseLibrary';

describe('computeRestSecondsRemaining', () => {
  it('returns 0 when there is no end timestamp', () => {
    expect(computeRestSecondsRemaining(null)).toBe(0);
    expect(computeRestSecondsRemaining(undefined)).toBe(0);
  });

  it('returns the ceil of remaining ms as seconds while the rest is in progress', () => {
    const now = 1_000_000;
    // 59.5s remaining -> ceil to 60
    expect(computeRestSecondsRemaining(now + 59_500, now)).toBe(60);
    // exactly 30s remaining
    expect(computeRestSecondsRemaining(now + 30_000, now)).toBe(30);
  });

  it('never goes negative once restEndAt has passed', () => {
    const now = 1_000_000;
    expect(computeRestSecondsRemaining(now - 5_000, now)).toBe(0);
  });

  // This is the actual bug being fixed: a screen locked/tab backgrounded for
  // a long stretch used to leave a tick-decremented counter reading way too
  // high (it only counted the setInterval ticks that got to run). Deriving
  // remaining time from the fixed end timestamp instead means an arbitrarily
  // long gap (5 minutes here, standing in for "screen was off") still reads
  // the correct remaining time the instant it's checked again.
  it('reflects real elapsed time across a long gap, not ticks that ran', () => {
    const restStartedAt = 1_000_000;
    const restEndAt = restStartedAt + 60_000; // 60s rest
    const muchLater = restStartedAt + 5 * 60_000; // 5 minutes later, e.g. screen was locked
    expect(computeRestSecondsRemaining(restEndAt, muchLater)).toBe(0);
  });
});

describe('cardio calories when only distance or only time is logged', () => {
  const done = (set) => ({ isCompleted: true, completedAt: 1, ...set });
  const kcalFor = (name, set, kg = 70) =>
    computeLiveCalories([{ name, sets: [done(set)] }], null, [], kg).totalKcal;

  // The confirmed case: "Treadmill Run 2.9 km", no time -> saved as 0 kcal.
  // Typical running pace 9 km/h -> ~19.3 min at 8.3 MET for 70 kg.
  it('counts a km-only run from the typical pace instead of 0', () => {
    expect(kcalFor('Treadmill Run', { distanceKm: '2.9', time: '' })).toBeCloseTo(196.6, 0);
  });

  it('counts a time-only set from the typical pace instead of 0', () => {
    // Cross Trainer is a flat 5.0 MET: 5 x 3.5 x 70 / 200 x 20 min = 122.5
    expect(kcalFor('Cross Trainer', { distanceKm: '', time: '20:00' })).toBeCloseTo(122.5, 1);
  });

  it('gives a km-only set the same total as logging it at the typical pace', () => {
    // 2.5 km walking at the assumed 5 km/h = 30:00
    expect(kcalFor('Walking', { distanceKm: '2.5', time: '' }))
      .toBeCloseTo(kcalFor('Walking', { distanceKm: '2.5', time: '30:00' }), 1);
  });

  it('still uses the real pace when both are logged', () => {
    // 10 km in 20 min cycling = 30 km/h -> 12.0 MET: 12 x 3.5 x 70 / 200 x 20 = 294
    expect(kcalFor('Cycling', { distanceKm: '10', time: '20:00' })).toBeCloseTo(294, 1);
  });

  it('counts nothing when neither distance nor time is logged', () => {
    expect(kcalFor('Stationary Bike HIIT', { distanceKm: '0', time: '' })).toBe(0);
  });

  it('matches the live estimate for the same km-only set', () => {
    expect(estimateCardioKcal('Treadmill Run', '2.9', 0)).toBeCloseTo(196.6, 0);
  });
});

describe('loaded carry calories (reps field holds meters)', () => {
  const done = (set) => ({ isCompleted: true, completedAt: 1, ...set });
  const kcalFor = (name, set, kg = 70) =>
    computeLiveCalories([{ name, sets: [done(set)] }], null, [], kg).totalKcal;

  it('prices a 40 m Farmer Walk as ~40 s of carrying, not 40 reps', () => {
    // 40 m / 1.0 m/s = 40 s; 6.0 MET on 70 kg body + 10 kg load:
    // 6 x 3.5 x 80 / 200 x (40/60) = 5.6 (was 16.8 as 40 x 3 s "reps")
    expect(kcalFor('Farmer Walk', { reps: '40', weight: '10' })).toBeCloseTo(5.6, 1);
  });

  it('prices High Knees Walk as a slower bodyweight drill', () => {
    // 40 m / 0.7 m/s = 57.1 s at 8.0 MET, 70 kg: 8 x 3.5 x 70 / 200 x 0.952 = 9.3
    expect(kcalFor('High Knees Walk', { reps: '40', weight: '' })).toBeCloseTo(9.3, 1);
  });

  it('does not cut an ordinary long carry off at the 100-rep ceiling', () => {
    expect(kcalFor('Farmer Walk', { reps: '150', weight: '10' }))
      .toBeGreaterThan(kcalFor('Farmer Walk', { reps: '100', weight: '10' }));
  });

  it('counts nothing for a carry with no distance', () => {
    expect(kcalFor('Farmer Walk', { reps: '0', weight: '20' })).toBe(0);
  });

  it('leaves regular strength sets priced as strength', () => {
    // 10 reps x 3 s at 5.0 MET, 70 kg body + 50 kg bar: 5 x 3.5 x 120 / 200 x 0.5 = 5.25
    // + 60 s rest credit at 3.5 MET on 70 kg: 4.29
    expect(kcalFor('Bench Press', { reps: '10', weight: '50' })).toBeCloseTo(9.5, 1);
  });
});

describe('rowing machine and swimming calories', () => {
  const done = (set) => ({ isCompleted: true, completedAt: 1, ...set });
  const kcalFor = (name, set, kg = 70) =>
    computeLiveCalories([{ name, sets: [done(set)] }], null, [], kg).totalKcal;
  // kcal = MET x 3.5 x kg / 200 x minutes; 70 kg -> 1.225 x MET per minute
  const perMin = (met) => met * 3.5 * 70 / 200;

  it('prices a 2:30/500m erg (5 km in 25 min) at 7.0 MET, not as an 11.0 MET run', () => {
    expect(kcalFor('Rowing Machine', { distanceKm: '5', time: '25:00' })).toBeCloseTo(perMin(7.0) * 25, 1);
  });

  it('steps rowing intensity up with pace', () => {
    expect(kcalFor('Rowing Machine', { distanceKm: '2', time: '12:00' })).toBeCloseTo(perMin(4.8) * 12, 1); // 10 km/h
    expect(kcalFor('Rowing Machine', { distanceKm: '2', time: '09:00' })).toBeCloseTo(perMin(8.5) * 9, 1);  // 13.3 km/h
    expect(kcalFor('Rowing Machine', { distanceKm: '2', time: '08:00' })).toBeCloseTo(perMin(12.0) * 8, 1); // 15 km/h
  });

  it('prices swimming by swim pace, not the running floor', () => {
    expect(kcalFor('Swimming', { distanceKm: '1', time: '30:00' })).toBeCloseTo(perMin(5.8) * 30, 1); // 2 km/h
    expect(kcalFor('Swimming', { distanceKm: '1', time: '20:00' })).toBeCloseTo(perMin(8.3) * 20, 1); // 3 km/h
    expect(kcalFor('Swimming', { distanceKm: '1', time: '14:00' })).toBeCloseTo(perMin(9.8) * 14, 1); // 4.3 km/h
  });

  it('auto-fills km from swim and erg pace, not running pace', () => {
    expect(estimateCardioDistanceKm('Swimming', 1800)).toBe(1);        // 30 min at 2 km/h
    expect(estimateCardioDistanceKm('Rowing Machine', 1500)).toBe(5);  // 25 min at 12 km/h
  });

  it('leaves running unchanged', () => {
    expect(kcalFor('Running', { distanceKm: '5', time: '25:00' })).toBeCloseTo(perMin(11.0) * 25, 1); // 12 km/h
  });
});

describe('light core vs vigorous bodyweight vs weight training', () => {
  const done = (set) => ({ isCompleted: true, completedAt: 1, ...set });
  const kcalFor = (name, set, kg = 70) =>
    computeLiveCalories([{ name, sets: [done(set)] }], null, [], kg).totalKcal;
  // 20 reps x 2.5 s = 50 s; 70 kg -> MET x 3.5 x 70 / 200 x (50/60)
  const bw20 = (met) => met * 3.5 * 70 / 200 * (50 / 60);

  it('prices light core moves at 3.8 MET', () => {
    ['Alternate Leg raises', 'Russian Twist', 'Shoulder Taps', 'Glute Bridge', 'Decline Crunch'].forEach(name => {
      expect(kcalFor(name, { reps: '20', weight: '' })).toBeCloseTo(bw20(3.8), 1);
    });
  });

  it('keeps vigorous bodyweight moves at 8.0 MET', () => {
    ['Push Up', 'Burpee', 'Jumping Jack', 'Mountain Climber', 'Pull-Ups', 'Jump Squat'].forEach(name => {
      expect(kcalFor(name, { reps: '20', weight: '' })).toBeCloseTo(bw20(8.0), 1);
    });
  });

  it('adds one 60 s rest credit per weighted set, not per rep', () => {
    const rest = 3.5 * 3.5 * 70 / 200; // 4.29 kcal
    const set = (reps) => 5 * 3.5 * (70 + 40) / 200 * (reps * 3 / 60) + rest;
    expect(kcalFor('Lat Pulldown', { reps: '8', weight: '40' })).toBeCloseTo(set(8), 1);
    expect(kcalFor('Lat Pulldown', { reps: '15', weight: '40' })).toBeCloseTo(set(15), 1);
  });

  it('gives no rest credit to a weighted set with 0 reps', () => {
    expect(kcalFor('Bench Press', { reps: '0', weight: '60' })).toBe(0);
  });

  it('now ranks a weights set above the same number of light core reps', () => {
    expect(kcalFor('Bench Press', { reps: '10', weight: '40' }))
      .toBeGreaterThan(kcalFor('Russian Twist', { reps: '10', weight: '' }));
  });
});

describe('Jump Squat', () => {
  it('is a bodyweight move (Bodyweight/+Add Weight toggle), unlike loaded squats', () => {
    expect(isBodyweightExercise('Jump Squat')).toBe(true);
    ['Barbell Squat', 'Goblet Squat', 'Smith Machine Squat', 'Bulgarian Split Squat'].forEach(n =>
      expect(isBodyweightExercise(n)).toBe(false));
  });

  it('counts a held 5 kg as added load at the vigorous bracket, with no rest credit', () => {
    // 15 reps x 2.5 s = 37.5 s at 8.0 MET on 70 + 5 kg
    const kcal = computeLiveCalories([{ name: 'Jump Squat', sets: [{ isCompleted: true, completedAt: 1, reps: '15', weight: '5' }] }], 1, [], 70).totalKcal;
    expect(kcal).toBeCloseTo(8 * 3.5 * 75 / 200 * (37.5 / 60), 1);
  });
});

describe('Jump Rope (reps field holds skips)', () => {
  const done = (set) => ({ isCompleted: true, completedAt: 1, ...set });
  const kcalFor = (name, set, kg = 70) =>
    computeLiveCalories([{ name, sets: [done(set)] }], null, [], kg).totalKcal;

  it('prices 110 skips as one minute of moderate rope jumping (11.8 MET)', () => {
    // 11.8 x 3.5 x 70 / 200 x 1 min = 14.5 (was ~48 as 100 lifting reps + rest)
    expect(kcalFor('Jump Rope', { reps: '110', weight: '' })).toBeCloseTo(14.5, 1);
  });

  it('prices the real 106-skip set at ~18 kcal for a 91.8 kg client, not ~54', () => {
    expect(kcalFor('Jump Rope', { reps: '106', weight: '0' }, 91.8)).toBeCloseTo(18.3, 1);
  });

  it('does not cut an ordinary long set off at the 100-rep ceiling', () => {
    expect(kcalFor('Jump Rope', { reps: '300', weight: '' }))
      .toBeCloseTo(3 * kcalFor('Jump Rope', { reps: '100', weight: '' }), 0);
  });

  it('recognises common names and shows the Bodyweight toggle', () => {
    ['Jump Rope', 'Jumprope', 'Skipping', 'Double Unders'].forEach(n => {
      expect(isJumpRopeExercise(n)).toBe(true);
      expect(isBodyweightExercise(n)).toBe(true);
    });
    expect(isJumpRopeExercise('Battle Rope')).toBe(false);
    expect(isJumpRopeExercise('Triceps Rope Pushdown')).toBe(false);
  });
});

describe('weighted strength: MET by lift type', () => {
  const done = (set) => ({ isCompleted: true, completedAt: 1, ...set });
  const workOnly = (name, set, kg = 70) =>
    computeLiveCalories([{ name, sets: [done(set)] }], null, [], kg).workKcal;

  it('prices single-joint lifts at 3.5 MET and multi-joint lifts at 5.0', () => {
    // 15 reps x 3 s = 45 s, 70 kg body + 10 kg load
    const work = (met) => met * 3.5 * 80 / 200 * 0.75;
    ['Wrist Curl', 'Lateral Raise', 'Cable Shrug', 'Leg Extension', 'Pec Deck Fly', 'Triceps Pushdown', 'Face Pull', 'Standing hip abduction', 'Standing Calf Raise']
      .forEach(name => expect(workOnly(name, { reps: '15', weight: '10' })).toBeCloseTo(work(3.5), 1));
    ['Seated Cable Row', 'Chest Press (Machine)', 'Lat Pull Down', 'Barbell Squat', 'Deadlift', 'Leg Press', 'Clean and Press', 'Shoulder Press (Dumbbell)']
      .forEach(name => expect(workOnly(name, { reps: '15', weight: '10' })).toBeCloseTo(work(5.0), 1));
  });

  it('does not mistake a press or row for an isolation lift', () => {
    ['Clean to Rotate Press(landline)', 'Upright Row (Barbell)', 'Bench Press', 'Romanian Deadlift'].forEach(name =>
      expect(isIsolationLift(name)).toBe(false));
  });
});

describe('weighted strength: rest credit bounded by the session clock', () => {
  const T0 = 1_000_000;
  const set = (completedAt) => ({ reps: '15', weight: '15', isCompleted: true, completedAt });
  const rest60 = 3.5 * 3.5 * 70 / 200; // one full 60 s rest credit, 70 kg

  it('gives every set its full 60 s rest when the sets are spread out', () => {
    // 3 sets, 3 minutes apart: plenty of clock for 3 x (45 s + 60 s)
    const ex = [{ name: 'Seated Cable Row', sets: [set(T0), set(T0 + 180_000), set(T0 + 360_000)] }];
    expect(computeLiveCalories(ex, T0, [], 70).restKcal).toBeCloseTo(rest60 * 3, 1);
  });

  it('never credits more rest than the clock allows', () => {
    // 3 sets ticked 30 s apart: clock 60 s + 60 s slack = 120 s, work 135 s -> no rest
    const ex = [{ name: 'Seated Cable Row', sets: [set(T0), set(T0 + 30_000), set(T0 + 60_000)] }];
    expect(computeLiveCalories(ex, T0, [], 70).restKcal).toBe(0);
  });

  it('subtracts pauses and logged cardio time from the clock', () => {
    // Clock 10 min, of which 5 min paused and a 5-min walk -> only the 60 s slack is left, minus 45 s work
    const ex = [
      { name: 'Treadmill Walk', sets: [{ distanceKm: '0.4', time: '05:00', isCompleted: true, completedAt: T0 + 300_000 }] },
      { name: 'Seated Cable Row', sets: [set(T0 + 600_000)] },
    ];
    const pauses = [{ pausedAt: T0 + 300_000, resumedAt: T0 + 600_000 }];
    expect(computeLiveCalories(ex, T0, pauses, 70).restKcal).toBeCloseTo(rest60 * (15 / 60), 1);
  });

  it('does not move while the clock runs with nothing new logged', () => {
    const ex = [{ name: 'Seated Cable Row', sets: [set(T0), set(T0 + 30_000)] }];
    const before = computeLiveCalories(ex, T0, [], 70).totalKcal;
    const openPause = [{ pausedAt: T0 + 3_600_000, resumedAt: null }];
    expect(computeLiveCalories(ex, T0, openPause, 70).totalKcal).toBe(before);
  });

  // The session reported 2026-09-29: 35 min, light machine/dumbbell work + a
  // 10-min treadmill walk, 98 kg client. Saved 349.8 kcal under the old
  // formula; a moderate 3.5 MET for 35 min at 98 kg is ~210 kcal.
  it('brings the reported 35-minute session near the Compendium estimate', () => {
    const sets = (n, reps, weight, startMin) => Array.from({ length: n }, (_, i) =>
      ({ reps: String(reps), weight: String(weight), isCompleted: true, completedAt: T0 + (startMin + i * 1.2) * 60_000 }));
    const ex = [
      { name: 'Lateral Raise', sets: sets(3, 15, 2.5, 0) },
      { name: 'Standing Calf Raise', sets: sets(3, 15, 1, 4) },
      { name: 'High Knees Walk', sets: sets(3, 26, 0, 8) },
      { name: 'Seated Cable Row', sets: sets(3, 15, 15, 12) },
      { name: 'Chest Press (Machine)', sets: sets(3, 15, 15, 16) },
      { name: 'Cable Shrug', sets: sets(3, 15, 15, 20) },
      { name: 'Wrist Curl', sets: sets(3, 20, 2.5, 23) },
      { name: 'Treadmill Walk', sets: [{ distanceKm: '0.83', time: '10:00', isCompleted: true, completedAt: T0 + 35 * 60_000 }] },
    ];
    const kcal = computeLiveCalories(ex, T0, [], 98).totalKcal;
    expect(kcal).toBeGreaterThan(200);
    expect(kcal).toBeLessThan(270);
  });
});
