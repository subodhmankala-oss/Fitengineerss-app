import { describe, it, expect } from 'vitest';
import { computeRestSecondsRemaining, computeLiveCalories, estimateCardioKcal, estimateCardioDistanceKm } from './liveWorkoutTimer';

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
    computeLiveCalories([{ name, sets: [done(set)] }], 1, [], kg).totalKcal;

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

  it('leaves regular strength sets unchanged', () => {
    // 10 reps x 3 s at 6.0 MET, 70 kg body + 50 kg bar: 6 x 3.5 x 120 / 200 x 0.5 = 6.3
    expect(kcalFor('Bench Press', { reps: '10', weight: '50' })).toBeCloseTo(6.3, 1);
  });
});

describe('rowing machine and swimming calories', () => {
  const done = (set) => ({ isCompleted: true, completedAt: 1, ...set });
  const kcalFor = (name, set, kg = 70) =>
    computeLiveCalories([{ name, sets: [done(set)] }], 1, [], kg).totalKcal;
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
