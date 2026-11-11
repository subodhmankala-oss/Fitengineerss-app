import { describe, it, expect } from 'vitest';
import {
  LEVELS, IMPACT_ORDER, LEVEL_RULES, GOAL_RULES, GOAL_ALIASES, AGE_BANDS, BMI, SEX_RULES,
  INJURY_AREAS, MISSING_DATA, TRAINING_DAYS, TAG_VALUES, UNTAGGED
} from './aiProgrammingRules.js';
import { EXERCISE_TAGS } from './exerciseTags.js';
import { getExerciseTags, untaggedWarnings } from '../utils/exerciseTags.js';
import { exerciseNameKey } from '../utils/exerciseName.js';

const isRange = (r) => Array.isArray(r) && r.length === 2 && r[0] <= r[1];
const allows = (cap, impact) => cap == null || IMPACT_ORDER.indexOf(impact) <= IMPACT_ORDER.indexOf(cap);

describe('exercise tags', () => {
  it('every row uses only the section 9 values', () => {
    for (const [name, impact, difficulty, joints, equipment] of EXERCISE_TAGS) {
      expect(name.trim(), name).toBe(name);
      expect(TAG_VALUES.impact, name).toContain(impact);
      expect(TAG_VALUES.difficulty, name).toContain(difficulty);
      expect(TAG_VALUES.equipment, name).toContain(equipment);
      joints.forEach(j => expect(TAG_VALUES.joints, name).toContain(j));
      expect(new Set(joints).size, name).toBe(joints.length);
    }
  });

  it('has one row per exercise (no two names share a lookup key)', () => {
    const keys = EXERCISE_TAGS.map(([n]) => exerciseNameKey(n));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('matches the draft example rows', () => {
    expect(getExerciseTags('Deadlift')).toMatchObject({ impact: 'low', difficulty: 3, joints: ['lumbar', 'hip'], equipment: 'barbell' });
    expect(getExerciseTags('Goblet Squat')).toMatchObject({ impact: 'low', difficulty: 1, joints: ['knee'], equipment: 'dumbbell' });
    expect(getExerciseTags('Box jump')).toMatchObject({ impact: 'high', difficulty: 2, joints: ['knee'], equipment: 'other' });
  });

  it('finds spelling variants', () => {
    expect(getExerciseTags('face pulls')?.name).toBe('Face Pull');
    expect(getExerciseTags('Pull‑Ups')?.name).toBe('Pull-up');
  });
});

describe('rules config', () => {
  it('has every level with valid ranges', () => {
    for (const level of LEVELS) {
      const r = LEVEL_RULES[level];
      ['exercisesPerDay', 'compoundLiftsPerDay', 'setsPerExercise'].forEach(k => expect(isRange(r[k]), `${level}.${k}`).toBe(true));
      expect(r.weeklySetsLargeMuscle.target).toBeLessThanOrEqual(r.weeklySetsLargeMuscle.cap);
      expect(r.weeklySetsSmallMuscle.target).toBeLessThanOrEqual(r.weeklySetsSmallMuscle.cap);
      expect(TAG_VALUES.difficulty).toContain(r.maxDifficulty);
    }
  });

  it('has reps for every goal × level', () => {
    for (const [goal, g] of Object.entries(GOAL_RULES)) {
      for (const level of LEVELS) {
        expect(isRange(g.mainLiftReps[level]), `${goal} main ${level}`).toBe(true);
        expect(isRange(g.accessoryReps[level]), `${goal} acc ${level}`).toBe(true);
        expect(isRange(g.holdSeconds[level]), `${goal} hold ${level}`).toBe(true);
      }
    }
    GOAL_ALIASES.forEach(a => expect(GOAL_RULES).toHaveProperty(a.goal));
    expect(GOAL_RULES).toHaveProperty(MISSING_DATA.goal);
  });

  it('age bands cover every age once, in order', () => {
    expect(AGE_BANDS[0].minAge).toBeNull();
    expect(AGE_BANDS.at(-1).maxAge).toBeNull();
    for (let i = 1; i < AGE_BANDS.length; i++) expect(AGE_BANDS[i].minAge).toBe(AGE_BANDS[i - 1].maxAge + 1);
    for (const band of AGE_BANDS) {
      for (const level of LEVELS) {
        const cap = band.impactCap[level];
        if (cap !== null) expect(IMPACT_ORDER).toContain(cap);
      }
    }
  });

  it('BMI bands are ordered and skip Advanced (change 2c)', () => {
    expect(BMI.appliesToLevels).toEqual(['beginner', 'intermediate']);
    for (let i = 1; i < BMI.bands.length; i++) expect(BMI.bands[i].minBmi).toBeGreaterThan(BMI.bands[i - 1].maxBmi);
  });

  it('never defaults a missing experience to Beginner (change 2a)', () => {
    expect(MISSING_DATA.experienceFrom).toEqual(['experience', 'library_level', 'coachPick']);
    expect(MISSING_DATA.experienceFrom).not.toContain('beginner');
  });

  it('lets the coach day count win with a warning (change 2b)', () => {
    expect(TRAINING_DAYS.coachChoiceWins).toBe(true);
    expect(TRAINING_DAYS.overMaxWarning).toMatch(/\{days\}.*\{max\}/);
  });

  it('sends no placeholder weight (change 2d)', () => {
    expect(MISSING_DATA.sendWeightWhenMissing).toBe(false);
  });

  it('keeps the female glute emphasis off (change 2e)', () => {
    expect(SEX_RULES.femaleGluteEmphasis.enabled).toBe(false);
  });

  it('only names catalog exercises', () => {
    const named = [
      ...AGE_BANDS.flatMap(b => b.excludeExercises),
      ...BMI.bands.flatMap(b => [...b.excludeExercises, ...b.preferredCardio]),
      ...Object.values(INJURY_AREAS).flatMap(a => [...a.preferred, ...a.alsoExclude])
    ];
    named.forEach(n => expect(getExerciseTags(n), n).not.toBeNull());
  });

  it('never excludes an injury area’s own preferred substitutes', () => {
    for (const [area, rule] of Object.entries(INJURY_AREAS)) {
      rule.joints.forEach(j => expect(TAG_VALUES.joints, area).toContain(j));
      for (const name of rule.preferred) {
        const joints = getExerciseTags(name).joints;
        expect(joints.filter(j => rule.joints.includes(j)), `${area}: ${name}`).toEqual([]);
      }
    }
  });

  it('BMI preferred cardio fits the band’s own impact cap', () => {
    for (const band of BMI.bands) {
      band.preferredCardio.forEach(n => expect(allows(band.impactCap, getExerciseTags(n).impact), `${band.label}: ${n}`).toBe(true));
    }
  });
});

describe('untagged exercises (custom)', () => {
  const names = ['Goblet Squat', "Coach Ravi's Sandbag Clean", "coach ravi's sandbag clean"];

  it('are never auto-excluded', () => {
    expect(UNTAGGED.autoExclude).toBe(false);
  });

  it('are flagged when the client has an injury or an impact cap', () => {
    expect(untaggedWarnings(names, { hasInjury: true })).toEqual([
      { name: "Coach Ravi's Sandbag Clean", warning: expect.stringContaining("Coach Ravi's Sandbag Clean") }
    ]);
    expect(untaggedWarnings(names, { hasImpactCap: true })).toHaveLength(1);
  });

  it('are not flagged otherwise', () => {
    expect(untaggedWarnings(names, {})).toEqual([]);
  });
});
