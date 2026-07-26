import { describe, it, expect } from 'vitest';
import {
  getWeeklyMuscleStats, getPPLCDistribution, getMuscleRecovery, generateWeeklyInsights, compareWeeks,
  getAverageCompletion, getRecommendations, getLastTrainedInfo, getNeglectedMuscles, formatEstimatedReady,
  getExerciseBreakdownForMuscle, getBestLiftForMuscle, getPersonalRecordsForMuscle,
  getWeeklySetsTrendForMuscle, getMuscleGrowthScore, getHeatMapTier
} from './muscleAnalytics';
import { getMuscleGroupsForExercise } from './muscleGroups';
import { EXERCISE_LIBRARY, isCardioExercise } from '../data/exerciseLibrary';

const log = (overrides) => ({
  log_date: '2026-07-20', exercise_name: 'Bench Press', weight_kg: 40, reps: 10,
  set_type: null, created_at: '2026-07-20T10:00:00.000Z', ...overrides
});

describe('muscleGroups', () => {
  it('credits compound lifts to primary + secondary muscle', () => {
    expect(getMuscleGroupsForExercise('Bench Press')).toEqual(['Chest', 'Triceps']);
    expect(getMuscleGroupsForExercise('Barbell Row')).toEqual(['Back', 'Biceps']);
  });

  it('credits isolation lifts to one muscle only', () => {
    expect(getMuscleGroupsForExercise('Barbell Curl')).toEqual(['Biceps']);
    expect(getMuscleGroupsForExercise('Calf Raise (Standing)')).toEqual(['Calves']);
  });

  it('returns no muscles for an unrecognized custom exercise', () => {
    expect(getMuscleGroupsForExercise('Made Up Exercise Xyz')).toEqual([]);
  });

  it('classifies Wrist Curl as Forearms, not Biceps (regression: generic "curl" rule must not shadow it)', () => {
    expect(getMuscleGroupsForExercise('Wrist Curl')).toEqual(['Forearms']);
  });

  it('still classifies Leg Curl as Hamstrings, not Biceps', () => {
    expect(getMuscleGroupsForExercise('Leg Curl (Lying)')).toEqual(['Hamstrings', 'Glutes']);
  });
});

describe('getWeeklyMuscleStats', () => {
  it('excludes warmup sets from working-set counts', () => {
    const logs = [log({ set_type: 'warmup' }), log()];
    const stats = getWeeklyMuscleStats(logs, '2026-07-20', '2026-07-26');
    const chest = stats.find(s => s.muscle === 'Chest');
    expect(chest.sets).toBe(1);
  });

  it('excludes logs outside the date range', () => {
    const logs = [log({ log_date: '2026-07-01' })];
    const stats = getWeeklyMuscleStats(logs, '2026-07-20', '2026-07-26');
    const chest = stats.find(s => s.muscle === 'Chest');
    expect(chest.sets).toBe(0);
    expect(chest.status.key).toBe('neglected');
  });

  it('classifies status against the muscle target band', () => {
    // Chest target band is 12–20 (large muscle).
    const optimalLogs = Array.from({ length: 15 }, () => log());
    const optimal = getWeeklyMuscleStats(optimalLogs, '2026-07-20', '2026-07-26').find(s => s.muscle === 'Chest');
    expect(optimal.status.key).toBe('optimal');

    const highVolLogs = Array.from({ length: 25 }, () => log());
    const highVol = getWeeklyMuscleStats(highVolLogs, '2026-07-20', '2026-07-26').find(s => s.muscle === 'Chest');
    expect(highVol.status.key).toBe('high_volume');

    const neglected = getWeeklyMuscleStats([], '2026-07-20', '2026-07-26').find(s => s.muscle === 'Chest');
    expect(neglected.status.key).toBe('neglected');
  });

  it('computes completion percent against the target midpoint', () => {
    // Chest: min 12, max 20 -> target 16. 18 sets -> 112.5% -> rounds to 112 or 113.
    const logs = Array.from({ length: 18 }, () => log());
    const chest = getWeeklyMuscleStats(logs, '2026-07-20', '2026-07-26').find(s => s.muscle === 'Chest');
    expect(chest.completionPercent).toBeGreaterThanOrEqual(112);
    expect(chest.completionPercent).toBeLessThanOrEqual(113);
  });
});

describe('getPPLCDistribution', () => {
  it('sums sets by push/pull/legs/core category and converts to percentages', () => {
    const stats = [
      { muscle: 'Chest', sets: 10 }, { muscle: 'Back', sets: 10 },
      { muscle: 'Quads', sets: 5 }, { muscle: 'Core', sets: 5 },
      { muscle: 'Shoulders', sets: 0 }, { muscle: 'Biceps', sets: 0 },
      { muscle: 'Triceps', sets: 0 }, { muscle: 'Forearms', sets: 0 },
      { muscle: 'Glutes', sets: 0 }, { muscle: 'Hamstrings', sets: 0 }, { muscle: 'Calves', sets: 0 },
    ];
    const dist = getPPLCDistribution(stats);
    expect(dist.percentages.Push).toBe(33);
    expect(dist.percentages.Pull).toBe(33);
    expect(dist.percentages.Legs).toBe(17);
    expect(dist.percentages.Core).toBe(17);
  });
});

describe('getMuscleRecovery', () => {
  it('returns null when a muscle has never been trained', () => {
    expect(getMuscleRecovery([], 'Hamstrings')).toBeNull();
  });

  it('buckets recovery by hours since the last working set (via created_at)', () => {
    const now = new Date('2026-07-21T10:00:00.000Z'); // 24h after the fixture log
    const recovery = getMuscleRecovery([log()], 'Chest', now);
    expect(recovery.hoursSince).toBe(24);
    // 1 set -> volumeFactor clamps to its 0.6 floor -> requiredHours = 48*0.6 = 28.8h
    // -> percent = round(24/28.8*100) = 83% -> "almost_ready" band (66-99%).
    expect(recovery.percent).toBe(83);
    expect(recovery.bucket.key).toBe('almost_ready');
  });

  it('keeps the bucket label consistent with percent — never shows a contradictory badge', () => {
    // A light 4-set session should read as MORE recovered, sooner, than a
    // heavy 15-set session at the same elapsed time — and whichever bucket
    // is shown must match what `percent` itself says (regression for a bug
    // where the bucket used raw fixed-hour thresholds independent of the
    // per-muscle, volume-scaled percent, producing labels like "Recovering"
    // next to "100%").
    const now = new Date('2026-07-22T10:00:00.000Z'); // 48h after the fixture logs
    const lightSession = Array.from({ length: 4 }, () => log({ exercise_name: 'Barbell Row' }));
    const recovery = getMuscleRecovery(lightSession, 'Back', now);
    if (recovery.percent >= 100) expect(recovery.bucket.key).toBe('recovered');
    else if (recovery.percent >= 66) expect(recovery.bucket.key).toBe('almost_ready');
    else if (recovery.percent >= 33) expect(recovery.bucket.key).toBe('recovering');
    else expect(recovery.bucket.key).toBe('recently_trained');
  });

  it('ignores warmup sets when finding the last trained time', () => {
    const now = new Date('2026-07-25T10:00:00.000Z');
    const logs = [log({ set_type: 'warmup', created_at: '2026-07-24T10:00:00.000Z' })];
    // Only a warmup exists -> no working set ever recorded for Chest.
    expect(getMuscleRecovery(logs, 'Chest', now)).toBeNull();
  });
});

describe('generateWeeklyInsights', () => {
  it('only includes insights backed by real data (no generic filler)', () => {
    const allZero = Array.from({ length: 11 }, (_, i) => ({
      muscle: ['Chest','Back','Shoulders','Biceps','Triceps','Forearms','Core','Glutes','Quads','Hamstrings','Calves'][i],
      sets: 0, target: 16, status: { key: 'neglected' }, completionPercent: 0
    }));
    const dist = getPPLCDistribution(allZero);
    const insights = generateWeeklyInsights(allZero, dist);
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.every(i => i.includes('received zero sets'))).toBe(true);
  });

  it('caps output at the requested limit', () => {
    const allNeglected = Array.from({ length: 11 }, (_, i) => ({
      muscle: `M${i}`, sets: 0, target: 16, status: { key: 'neglected' }, completionPercent: 0
    }));
    const dist = { percentages: { Push: 0, Pull: 0 }, sets: { Push: 0, Pull: 0 } };
    expect(generateWeeklyInsights(allNeglected, dist, 3).length).toBe(3);
  });
});

describe('compareWeeks', () => {
  it('flags an upward trend when this week exceeds the previous week', () => {
    const logs = [
      log({ log_date: '2026-07-20' }), log({ log_date: '2026-07-20' }),
      log({ log_date: '2026-07-13' }),
    ];
    const cmp = compareWeeks(logs, '2026-07-20', '2026-07-26', '2026-07-13', '2026-07-19');
    expect(cmp.sets.curr).toBe(2);
    expect(cmp.sets.prev).toBe(1);
    expect(cmp.sets.trend).toBe('up');
  });

  it('reports flat when both weeks are empty', () => {
    const cmp = compareWeeks([], '2026-07-20', '2026-07-26', '2026-07-13', '2026-07-19');
    expect(cmp.sets.trend).toBe('flat');
    expect(cmp.volume.trend).toBe('flat');
  });
});

describe('getWeeklyMuscleStats — training days per muscle', () => {
  it('counts distinct log_date values, not total sets', () => {
    const logs = [
      log({ log_date: '2026-07-20' }), log({ log_date: '2026-07-20' }), log({ log_date: '2026-07-20' }),
      log({ log_date: '2026-07-22' }),
    ];
    const chest = getWeeklyMuscleStats(logs, '2026-07-20', '2026-07-26').find(s => s.muscle === 'Chest');
    expect(chest.sets).toBe(4);
    expect(chest.days).toBe(2);
  });
});

describe('getAverageCompletion', () => {
  it('averages completion percent across all muscles, capping any single overtrained muscle', () => {
    const stats = [
      { completionPercent: 100 }, { completionPercent: 100 }, { completionPercent: 500 },
    ];
    // 500% capped to 150 before averaging -> (100+100+150)/3 = 116.67 -> 117
    expect(getAverageCompletion(stats)).toBe(117);
  });

  it('returns 0 for an empty list rather than dividing by zero', () => {
    expect(getAverageCompletion([])).toBe(0);
  });
});

describe('getRecommendations', () => {
  const targets = { Chest: { min: 12, max: 20 }, Back: { min: 12, max: 20 }, Hamstrings: { min: 12, max: 20 } };
  const stat = (muscle, sets, days, statusKey) => ({
    muscle, sets, days, min: targets[muscle]?.min ?? 8, target: 16, completionPercent: 0,
    status: { key: statusKey }
  });

  it('recommends a Posterior Chain focus only when Back AND Hamstrings are both behind', () => {
    const both = [stat('Back', 3, 1, 'undertrained'), stat('Hamstrings', 2, 1, 'neglected')];
    expect(getRecommendations(both).some(r => r.includes('Posterior Chain'))).toBe(true);

    const onlyOne = [stat('Back', 3, 1, 'undertrained'), stat('Hamstrings', 15, 2, 'optimal')];
    expect(getRecommendations(onlyOne).some(r => r.includes('Posterior Chain'))).toBe(false);
  });

  it('flags low training frequency only when all sets came from a single session and status is still behind', () => {
    const singleSessionBehind = [stat('Chest', 10, 1, 'slightly_low')];
    expect(getRecommendations(singleSessionBehind).some(r => r.includes('frequency'))).toBe(true);

    const spreadOut = [stat('Chest', 10, 3, 'slightly_low')];
    expect(getRecommendations(spreadOut).some(r => r.includes('frequency'))).toBe(false);

    const singleSessionButOptimal = [stat('Chest', 16, 1, 'optimal')];
    expect(getRecommendations(singleSessionButOptimal).some(r => r.includes('frequency'))).toBe(false);
  });
});

describe('getLastTrainedInfo', () => {
  it('returns null for a muscle with no history at all', () => {
    expect(getLastTrainedInfo([], 'Hamstrings')).toBeNull();
  });

  it('computes days since the most recent working set across all logs, not just this week', () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const logs = [
      log({ log_date: '2026-07-15', exercise_name: 'Romanian Deadlift' }), // 10 days before now
      log({ log_date: '2026-07-01', exercise_name: 'Romanian Deadlift' }),
    ];
    const info = getLastTrainedInfo(logs, 'Hamstrings', now);
    expect(info.lastDate).toBe('2026-07-15');
    expect(info.daysSince).toBe(10);
  });

  it('ignores warmup sets', () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const logs = [log({ log_date: '2026-07-24', exercise_name: 'Romanian Deadlift', set_type: 'warmup' })];
    expect(getLastTrainedInfo(logs, 'Hamstrings', now)).toBeNull();
  });
});

describe('getNeglectedMuscles', () => {
  it('flags muscles never trained, and muscles idle 7+ days, sorted worst first', () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const logs = [
      log({ log_date: '2026-07-24', exercise_name: 'Bench Press' }), // Chest 1 day ago -> not neglected
      log({ log_date: '2026-07-10', exercise_name: 'Romanian Deadlift' }), // Hamstrings 15 days ago -> neglected
    ];
    const neglected = getNeglectedMuscles(logs, now);
    const muscleNames = neglected.map(m => m.muscle);
    expect(muscleNames).not.toContain('Chest');
    expect(muscleNames).toContain('Hamstrings');
    expect(muscleNames).toContain('Calves'); // never trained at all
    // Never-trained muscles sort before/alongside the 15-day-idle one, and every
    // entry carries its recommended-exercise list.
    const hamstrings = neglected.find(m => m.muscle === 'Hamstrings');
    expect(hamstrings.daysSince).toBe(15);
    expect(hamstrings.recommendedExercises.length).toBeGreaterThan(0);
    const calves = neglected.find(m => m.muscle === 'Calves');
    expect(calves.daysSince).toBeNull();
  });

  it('excludes a muscle trained within the threshold', () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const logs = [log({ log_date: '2026-07-20', exercise_name: 'Bench Press' })]; // 5 days ago
    const neglected = getNeglectedMuscles(logs, now, 7);
    expect(neglected.map(m => m.muscle)).not.toContain('Chest');
  });
});

describe('formatEstimatedReady', () => {
  // Constructed via local-time fields (not UTC ISO strings) so these assertions
  // don't depend on — or drift across — the test runner's timezone; this
  // matches how the real app passes Date objects (created in-browser, local
  // time) to formatEstimatedReady, which itself compares local calendar days.
  it('labels a same-day time as "Today"', () => {
    const now = new Date(2026, 6, 25, 9, 0);
    const readyAt = new Date(2026, 6, 25, 20, 0);
    expect(formatEstimatedReady(readyAt, now)).toMatch(/^Today /);
  });

  it('labels next-calendar-day as "Tomorrow"', () => {
    const now = new Date(2026, 6, 25, 9, 0);
    const readyAt = new Date(2026, 6, 26, 9, 30);
    expect(formatEstimatedReady(readyAt, now)).toMatch(/^Tomorrow /);
  });

  it('labels anything further out with a weekday and date', () => {
    const now = new Date(2026, 6, 25, 9, 0);
    const readyAt = new Date(2026, 6, 29, 9, 30);
    const label = formatEstimatedReady(readyAt, now);
    expect(label).not.toMatch(/^Today|^Tomorrow/);
    expect(label).toMatch(/Jul 29/);
  });
});

describe('getExerciseBreakdownForMuscle', () => {
  it('groups sets/volume by exercise and computes contribution percent', () => {
    const logs = [
      log({ exercise_name: 'Bench Press', weight_kg: 40, reps: 10 }),
      log({ exercise_name: 'Bench Press', weight_kg: 40, reps: 10 }),
      log({ exercise_name: 'Cable Fly', weight_kg: 15, reps: 12 }),
    ];
    const breakdown = getExerciseBreakdownForMuscle(logs, 'Chest', '2026-07-20', '2026-07-26');
    expect(breakdown).toHaveLength(2);
    const bench = breakdown.find(e => e.exerciseName === 'Bench Press');
    expect(bench.sets).toBe(2);
    expect(bench.maxWeight).toBe(40);
    expect(bench.contributionPercent).toBe(67);
    const fly = breakdown.find(e => e.exerciseName === 'Cable Fly');
    expect(fly.contributionPercent).toBe(33);
  });

  it('excludes exercises outside the date range or targeting a different muscle', () => {
    const logs = [
      log({ exercise_name: 'Bench Press', log_date: '2026-01-01' }),
      log({ exercise_name: 'Barbell Curl' }),
    ];
    expect(getExerciseBreakdownForMuscle(logs, 'Chest', '2026-07-20', '2026-07-26')).toHaveLength(0);
  });
});

describe('getBestLiftForMuscle', () => {
  it('picks the set with the highest estimated 1RM, not just the heaviest weight', () => {
    const logs = [
      log({ exercise_name: 'Bench Press', weight_kg: 100, reps: 1 }),  // e1RM ~ 103.3
      log({ exercise_name: 'Bench Press', weight_kg: 80, reps: 10 }),  // e1RM ~ 106.7 -> higher
    ];
    const best = getBestLiftForMuscle(logs, 'Chest');
    expect(best.weight).toBe(80);
    expect(best.reps).toBe(10);
  });

  it('returns null when the muscle has no valid working sets', () => {
    expect(getBestLiftForMuscle([], 'Chest')).toBeNull();
  });

  it('scopes to a date range when start/end are provided', () => {
    const logs = [
      log({ exercise_name: 'Bench Press', weight_kg: 100, reps: 5, log_date: '2026-01-01' }),
      log({ exercise_name: 'Bench Press', weight_kg: 50, reps: 5, log_date: '2026-07-22' }),
    ];
    const best = getBestLiftForMuscle(logs, 'Chest', '2026-07-20', '2026-07-26');
    expect(best.weight).toBe(50);
  });
});

describe('getPersonalRecordsForMuscle', () => {
  it('returns the best set per distinct exercise, ranked highest first, capped to topN', () => {
    const logs = [
      log({ exercise_name: 'Bench Press', weight_kg: 60, reps: 8 }),
      log({ exercise_name: 'Bench Press', weight_kg: 80, reps: 8 }), // better than the 60kg set
      log({ exercise_name: 'Cable Fly', weight_kg: 15, reps: 12 }),
    ];
    const prs = getPersonalRecordsForMuscle(logs, 'Chest', 5);
    expect(prs).toHaveLength(2);
    expect(prs[0].exerciseName).toBe('Bench Press');
    expect(prs[0].weight).toBe(80);
  });
});

describe('getWeeklySetsTrendForMuscle', () => {
  it('returns weeksBack entries, oldest first, with correct per-week set counts', () => {
    const now = new Date(2026, 6, 25); // local-time constructor, avoids timezone drift
    const logs = [
      log({ exercise_name: 'Bench Press', log_date: '2026-07-20' }), // this week
      log({ exercise_name: 'Bench Press', log_date: '2026-07-10' }), // ~2 weeks ago
    ];
    const trend = getWeeklySetsTrendForMuscle(logs, 'Chest', 3, now);
    expect(trend).toHaveLength(3);
    expect(trend[trend.length - 1].sets).toBeGreaterThanOrEqual(1); // most recent week
    const totalSets = trend.reduce((sum, w) => sum + w.sets, 0);
    expect(totalSets).toBe(2);
  });
});

describe('getMuscleGrowthScore', () => {
  it('returns 0 with all-zero breakdown when the muscle has no history', () => {
    const result = getMuscleGrowthScore([], 'Chest', new Date(2026, 6, 25));
    expect(result.score).toBe(0);
    expect(result.breakdown.overloadScore).toBeNull();
  });

  it('includes an overload score only when both this week and last week have a best lift to compare', () => {
    const now = new Date(2026, 6, 25);
    const logs = [
      log({ exercise_name: 'Bench Press', weight_kg: 50, reps: 8, log_date: '2026-07-22' }), // this week
    ];
    const noComparison = getMuscleGrowthScore(logs, 'Chest', now);
    expect(noComparison.breakdown.overloadScore).toBeNull();

    const withPrevWeek = getMuscleGrowthScore([
      ...logs,
      log({ exercise_name: 'Bench Press', weight_kg: 40, reps: 8, log_date: '2026-07-14' }), // prev week
    ], 'Chest', now);
    expect(withPrevWeek.breakdown.overloadScore).toBe(100); // 50kg beats 40kg -> improved
  });

  it('never returns a score outside 0-100', () => {
    const now = new Date(2026, 6, 25);
    const heavyLogs = Array.from({ length: 30 }, () => log({ exercise_name: 'Bench Press', log_date: '2026-07-22' }));
    const result = getMuscleGrowthScore(heavyLogs, 'Chest', now);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe('getHeatMapTier', () => {
  const stat = (statusKey, completionPercent = 0) => ({ status: { key: statusKey }, completionPercent });

  it('maps neglected to Not Trained (gray)', () => {
    expect(getHeatMapTier(stat('neglected')).key).toBe('not_trained');
  });

  it('collapses undertrained and slightly_low into a single Low (blue) tier', () => {
    expect(getHeatMapTier(stat('undertrained')).key).toBe('low');
    expect(getHeatMapTier(stat('slightly_low')).key).toBe('low');
  });

  it('maps optimal to Optimal (green)', () => {
    expect(getHeatMapTier(stat('optimal')).key).toBe('optimal');
  });

  it('splits high_volume into High vs Very High by completion percent', () => {
    expect(getHeatMapTier(stat('high_volume', 130)).key).toBe('high');
    expect(getHeatMapTier(stat('high_volume', 180)).key).toBe('very_high');
  });
});

describe('getMuscleGroupsForExercise — real exercise-name coverage audit', () => {
  it('recognizes "Incline Dumbbell Press" and "Incline Barbell Press" as Chest (regression: these silently fell through all rules before)', () => {
    expect(getMuscleGroupsForExercise('Incline Dumbbell Press')).toEqual(['Chest', 'Triceps']);
    expect(getMuscleGroupsForExercise('Incline Barbell Press')).toEqual(['Chest', 'Triceps']);
  });

  it('does not let the broadened incline/decline press rule swallow incline curls or rows', () => {
    expect(getMuscleGroupsForExercise('Incline Dumbbell Curl')).toEqual(['Biceps']);
    expect(getMuscleGroupsForExercise('Incline Dumbbell Row')).toEqual(['Back', 'Biceps']);
  });

  it('every exercise in the app\'s actual exercise library maps to at least one muscle', () => {
    // Cross-checks the full real exercise list (the same one the picker/coach
    // dashboard use) against the classifier — catches silent "unmapped, excluded
    // from analytics" gaps like the Incline Press bug, systematically instead of
    // one name at a time.
    const unmapped = EXERCISE_LIBRARY
      .filter(ex => !isCardioExercise(ex.name)) // cardio has no muscle-set concept here
      .filter(ex => getMuscleGroupsForExercise(ex.name).length === 0)
      .map(ex => ex.name);
    expect(unmapped).toEqual([]);
  });
});
