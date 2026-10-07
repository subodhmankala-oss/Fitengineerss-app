import { describe, it, expect } from 'vitest';
import { computeRestSecondsRemaining, computeLiveCalories, estimateCardioKcal, estimateCardioDistanceKm, isJumpRopeExercise } from './liveWorkoutTimer';
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
    computeLiveCalories([{ name, sets: [done(set)] }], 1, [], kg).totalKcal;

  // The confirmed case: "Treadmill Run 2.9 km", no time -> saved as 0 kcal.
  // Typical running pace 9 km/h -> ~19.3 min at 8.3 MET (7.3 active) for 70 kg.
  it('counts a km-only run from the typical pace instead of 0', () => {
    expect(kcalFor('Treadmill Run', { distanceKm: '2.9', time: '' })).toBeCloseTo(172.9, 0);
  });

  it('counts a time-only set from the typical pace instead of 0', () => {
    // Cross Trainer is a flat 5.0 MET, 4.0 active: 4 x 3.5 x 70 / 200 x 20 min = 98
    expect(kcalFor('Cross Trainer', { distanceKm: '', time: '20:00' })).toBeCloseTo(98, 1);
  });

  it('gives a km-only set the same total as logging it at the typical pace', () => {
    // 2.5 km walking at the assumed 5 km/h = 30:00
    expect(kcalFor('Walking', { distanceKm: '2.5', time: '' }))
      .toBeCloseTo(kcalFor('Walking', { distanceKm: '2.5', time: '30:00' }), 1);
  });

  it('still uses the real pace when both are logged', () => {
    // 10 km in 20 min cycling = 30 km/h -> 12.0 MET, 11 active: 11 x 3.5 x 70 / 200 x 20 = 269.5
    expect(kcalFor('Cycling', { distanceKm: '10', time: '20:00' })).toBeCloseTo(269.5, 1);
  });

  it('counts nothing when neither distance nor time is logged', () => {
    expect(kcalFor('Stationary Bike HIIT', { distanceKm: '0', time: '' })).toBe(0);
  });

  it('matches the live estimate for the same km-only set', () => {
    expect(estimateCardioKcal('Treadmill Run', '2.9', 0)).toBeCloseTo(172.9, 0);
  });
});

describe('loaded carry calories (reps field holds meters)', () => {
  const done = (set) => ({ isCompleted: true, completedAt: 1, ...set });
  const kcalFor = (name, set, kg = 70) =>
    computeLiveCalories([{ name, sets: [done(set)] }], 1, [], kg).totalKcal;

  it('prices a 40 m Farmer Walk as ~40 s of carrying, not 40 reps', () => {
    // 40 m / 1.0 m/s = 40 s; 6.0 MET on 70 kg body + 10 kg load, minus 1 MET
    // resting on the 70 kg body: (6 x 80 - 70) x 3.5 / 200 x (40/60) = 4.8
    expect(kcalFor('Farmer Walk', { reps: '40', weight: '10' })).toBeCloseTo(4.8, 1);
  });

  it('prices High Knees Walk as a slower bodyweight drill', () => {
    // 40 m / 0.7 m/s = 57.1 s at 8.0 MET (7 active), 70 kg: 7 x 3.5 x 70 / 200 x 0.952 = 8.2
    expect(kcalFor('High Knees Walk', { reps: '40', weight: '' })).toBeCloseTo(8.2, 1);
  });

  it('does not cut an ordinary long carry off at the 100-rep ceiling', () => {
    expect(kcalFor('Farmer Walk', { reps: '150', weight: '10' }))
      .toBeGreaterThan(kcalFor('Farmer Walk', { reps: '100', weight: '10' }));
  });

  it('counts nothing for a carry with no distance', () => {
    expect(kcalFor('Farmer Walk', { reps: '0', weight: '20' })).toBe(0);
  });

  it('leaves regular strength sets priced as strength', () => {
    // 10 reps x 3 s at 6.0 MET, 70 kg body + 50 kg bar, minus resting:
    // (6 x 120 - 70) x 3.5 / 200 x 0.5 = 5.7, no rest credit
    expect(kcalFor('Bench Press', { reps: '10', weight: '50' })).toBeCloseTo(5.7, 1);
  });
});

describe('rowing machine and swimming calories', () => {
  const done = (set) => ({ isCompleted: true, completedAt: 1, ...set });
  const kcalFor = (name, set, kg = 70) =>
    computeLiveCalories([{ name, sets: [done(set)] }], 1, [], kg).totalKcal;
  // active kcal = (MET - 1) x 3.5 x kg / 200 x minutes; 70 kg -> 1.225 x (MET - 1) per minute
  const perMin = (met) => (met - 1) * 3.5 * 70 / 200;

  it('prices a 2:30/500m erg (5 km in 25 min) at 7.0 MET, not as an 11.0 MET run', () => {
    expect(kcalFor('Rowing Machine', { distanceKm: '5', time: '25:00' })).toBeCloseTo(perMin(7.0) * 25, 0);
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
    expect(kcalFor('Running', { distanceKm: '5', time: '25:00' })).toBeCloseTo(perMin(11.0) * 25, 0); // 12 km/h
  });
});

describe('light core vs vigorous bodyweight vs weight training', () => {
  const done = (set) => ({ isCompleted: true, completedAt: 1, ...set });
  const kcalFor = (name, set, kg = 70) =>
    computeLiveCalories([{ name, sets: [done(set)] }], 1, [], kg).totalKcal;
  // 20 reps x 2.5 s = 50 s; 70 kg -> (MET - 1) x 3.5 x 70 / 200 x (50/60)
  const bw20 = (met) => (met - 1) * 3.5 * 70 / 200 * (50 / 60);

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

  it('counts only the logged reps of a weighted set, with no rest credit', () => {
    const set = (reps) => (6 * (70 + 40) - 70) * 3.5 / 200 * (reps * 3 / 60);
    expect(kcalFor('Lat Pulldown', { reps: '8', weight: '40' })).toBeCloseTo(set(8), 1);
    expect(kcalFor('Lat Pulldown', { reps: '15', weight: '40' })).toBeCloseTo(set(15), 1);
  });

  it('counts nothing for a weighted set with 0 reps', () => {
    expect(kcalFor('Bench Press', { reps: '0', weight: '60' })).toBe(0);
  });

  it('now ranks a weights set above the same number of light core reps', () => {
    expect(kcalFor('Bench Press', { reps: '10', weight: '40' }))
      .toBeGreaterThan(kcalFor('Russian Twist', { reps: '10', weight: '' }));
  });
});

describe('Standing Calf Raise', () => {
  it('gets the Bodyweight/+Add Weight toggle; machine and seated variants stay loaded', () => {
    expect(isBodyweightExercise('Standing Calf Raise')).toBe(true);
    ['Seated Calf Raise', 'Calf Raise (Machine)'].forEach(n =>
      expect(isBodyweightExercise(n)).toBe(false));
  });
});

describe('Jump Squat', () => {
  it('is a bodyweight move (Bodyweight/+Add Weight toggle), unlike loaded squats', () => {
    expect(isBodyweightExercise('Jump Squat')).toBe(true);
    ['Barbell Squat', 'Goblet Squat', 'Smith Machine Squat', 'Bulgarian Split Squat'].forEach(n =>
      expect(isBodyweightExercise(n)).toBe(false));
  });

  it('counts a held 5 kg as added load at the vigorous bracket, with no rest credit', () => {
    // 15 reps x 2.5 s = 37.5 s at 8.0 MET on 70 + 5 kg, minus 1 MET resting on 70 kg
    const kcal = computeLiveCalories([{ name: 'Jump Squat', sets: [{ isCompleted: true, completedAt: 1, reps: '15', weight: '5' }] }], 1, [], 70).totalKcal;
    expect(kcal).toBeCloseTo((8 * 75 - 70) * 3.5 / 200 * (37.5 / 60), 1);
  });
});

describe('Jump Rope (reps field holds skips)', () => {
  const done = (set) => ({ isCompleted: true, completedAt: 1, ...set });
  const kcalFor = (name, set, kg = 70) =>
    computeLiveCalories([{ name, sets: [done(set)] }], 1, [], kg).totalKcal;

  it('prices 110 skips as one minute of moderate rope jumping (11.8 MET)', () => {
    // 10.8 active x 3.5 x 70 / 200 x 1 min = 13.2 (was ~48 as 100 lifting reps + rest)
    expect(kcalFor('Jump Rope', { reps: '110', weight: '' })).toBeCloseTo(13.2, 1);
  });

  it('prices the real 106-skip set at ~17 kcal for a 91.8 kg client, not ~54', () => {
    expect(kcalFor('Jump Rope', { reps: '106', weight: '0' }, 91.8)).toBeCloseTo(16.7, 1);
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

describe('recovery between sets', () => {
  const at = (sec) => 1_000_000 + sec * 1000;
  const set = (completedSec, fields) => ({ isCompleted: true, completedAt: at(completedSec), ...fields });
  // 70 kg, 3.5 MET recovery (2.5 active): 2.5 x 3.5 x 70 / 200 = 3.0625 kcal/min
  const recoveryKcal = (seconds) => 3.0625 * seconds / 60;
  const bench = (reps) => (6 * (70 + 50) - 70) * 3.5 / 200 * (reps * 3 / 60);
  const kcal = (exercises, pauses = []) => computeLiveCalories(exercises, at(0), pauses, 70).totalKcal;

  it('credits the real gap between two sets, minus the next set\'s own work', () => {
    // 10 reps = 30 s of work; next tick 90 s later -> 60 s recovery
    const sets = [set(30, { reps: '10', weight: '50' }), set(120, { reps: '10', weight: '50' })];
    expect(kcal([{ name: 'Bench Press', sets }])).toBeCloseTo(2 * bench(10) + recoveryKcal(60), 1);
  });

  it('caps recovery at 180 s however long the break was', () => {
    const sets = [set(30, { reps: '10', weight: '50' }), set(30 + 600, { reps: '10', weight: '50' })];
    expect(kcal([{ name: 'Bench Press', sets }])).toBeCloseTo(2 * bench(10) + recoveryKcal(180), 1);
  });

  it('credits nothing after the last set or for sets ticked back to back', () => {
    const sets = [set(30, { reps: '10', weight: '50' }), set(31, { reps: '10', weight: '50' })];
    expect(kcal([{ name: 'Bench Press', sets }])).toBeCloseTo(2 * bench(10), 1);
  });

  it('excludes paused time from the gap', () => {
    const sets = [set(30, { reps: '10', weight: '50' }), set(630, { reps: '10', weight: '50' })];
    // paused for 560 of the 600 s -> 40 s active, minus 30 s work = 10 s
    const pauses = [{ pausedAt: at(40), resumedAt: at(600) }];
    expect(kcal([{ name: 'Bench Press', sets }], pauses)).toBeCloseTo(2 * bench(10) + recoveryKcal(10), 1);
  });

  it('gives no recovery after a cardio set', () => {
    const exercises = [
      { name: 'Cycling', sets: [set(600, { distanceKm: '3', time: '10:00' })] },
      { name: 'Bench Press', sets: [set(700, { reps: '10', weight: '50' })] },
    ];
    const cardioOnly = computeLiveCalories([exercises[0]], at(0), [], 70).totalKcal;
    expect(kcal(exercises)).toBeCloseTo(cardioOnly + bench(10), 0);
  });

  // Reported 2026-10-07, 89.8 kg client: a 95-minute, 28-set chest day saved
  // 129.5 kcal next to 372.4 for a 59-minute treadmill + bike day.
  // His 28 sets over 95 minutes average a tick every ~200 s.
  it('puts a 95-minute weights day above a 59-minute cardio day', () => {
    const kg = 89.8;
    let t = 0;
    const lift = (name, reps, weight) => { t += 200; return { name, sets: [set(t, { reps: String(reps), weight: String(weight) })] }; };
    const exercises = [];
    [[12, 50], [6, 65], [5, 70], [2, 72.5]].forEach(([r, w]) => exercises.push(lift('Barbell Bench Press', r, w)));
    [[12, 45], [10, 50], [6, 55]].forEach(([r, w]) => exercises.push(lift('Incline Dumbbell Press', r, w)));
    [[12, 30], [12, 40], [10, 50], [3, 60]].forEach(([r, w]) => exercises.push(lift('Cable Chest Fly', r, w)));
    [10, 10, 10].forEach(r => exercises.push(lift('Weighted Dips', r, 0)));
    [[12, 35], [12, 45], [8, 50]].forEach(([r, w]) => exercises.push(lift('Triceps Pushdown', r, w)));
    [[12, 20], [10, 30], [7, 35]].forEach(([r, w]) => exercises.push(lift('Overhead Triceps Extension', r, w)));
    [12, 12, 10, 10, 8, 8].forEach(r => exercises.push(lift('Hanging Leg Raise', r, 0)));
    const weights = computeLiveCalories(exercises, at(0), [], kg).totalKcal;

    const cardio = computeLiveCalories([
      { name: 'Treadmill Run', sets: [set(1800, { distanceKm: '3.23', time: '30:00' })] },
      { name: 'Stationary Bike HIIT', sets: [set(2700, { distanceKm: '4.5', time: '15:00' })] },
    ], at(0), [], kg).totalKcal;

    // Compendium 3.5 MET over 95 min at 89.8 kg = ~373 active kcal.
    expect(weights).toBeGreaterThan(340);
    expect(weights).toBeLessThan(450);
    expect(cardio).toBeLessThan(340);
    expect(weights).toBeGreaterThan(cardio);
  });
});

describe('Treadmill brisk walk', () => {
  it('prices 6.46 km/h on a treadmill as a brisk walk (5.0 MET), not a run', () => {
    // 4.0 active x 3.5 x 89.8 / 200 x 30 = 188.6 (was 235.7 at the 6.0 running floor)
    expect(estimateCardioKcal('Treadmill Run', '3.23', 1800, 89.8)).toBeCloseTo(188.6, 1);
  });

  it('still prices a real treadmill run at running pace', () => {
    expect(estimateCardioKcal('Treadmill Run', '4', 1800, 70)).toBeCloseTo((8.3 - 1) * 3.5 * 70 / 200 * 30, 1);
  });
});

describe('Incline Walk and active (net) calories', () => {
  const done = (set) => ({ isCompleted: true, completedAt: 1, ...set });
  const kcalFor = (name, set, kg = 70) =>
    computeLiveCalories([{ name, sets: [done(set)] }], 1, [], kg).totalKcal;

  // Reported 2026-10-01: 45 min, 3.38 km, 80.3 kg saved as 379.4 kcal (flat
  // 6.0 gross MET). ACSM at 5% grade, 4.5 km/h -> 5.07 MET, 4.07 active:
  // 4.07 x 3.5 x 80.3 / 200 x 45 = ~257.
  it('prices the reported 45-minute incline walk at ~257 kcal, not 379', () => {
    expect(kcalFor('Incline Walk', { distanceKm: '3.38', time: '45:00' }, 80.3)).toBeCloseTo(257, -1);
  });

  it('scales Incline Walk with speed instead of a flat MET', () => {
    expect(kcalFor('Incline Walk', { distanceKm: '4.5', time: '45:00' }))
      .toBeGreaterThan(kcalFor('Incline Walk', { distanceKm: '3', time: '45:00' }));
  });

  it('never goes negative for a near-resting effort', () => {
    expect(kcalFor('Walking', { distanceKm: '0.1', time: '30:00' })).toBeGreaterThanOrEqual(0);
  });
});
