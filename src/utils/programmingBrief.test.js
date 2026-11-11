import { describe, it, expect } from 'vitest';
import { buildProgrammingBrief, resolveLevel, computeBmi } from './programmingBrief.js';
import { getExerciseTags } from './exerciseTags.js';
import { EXERCISE_TAGS } from '../data/exerciseTags.js';
import {
  LEVELS, LEVEL_RULES, GOAL_RULES, INJURY_AREAS, INJURY_UNMATCHED_WARNING, IMPACT_ORDER
} from '../data/aiProgrammingRules.js';

// The real tagged catalog plus one coach custom exercise (untagged).
const CUSTOM = { name: "Coach's Sandbag Shoulder Toss", muscle: 'Shoulders', category: 'Shoulders' };
const CATALOG = [...EXERCISE_TAGS.map(([name]) => ({ name, muscle: '', category: '' })), CUSTOM];

const ADULT = { age: 30, heightCm: 175, weightKg: 70, sex: 'male', goal: 'Muscle Building' }; // BMI 22.9
const run = (over = {}) => buildProgrammingBrief({ profile: ADULT, level: 'intermediate', catalog: CATALOG, ...over });
const names = (list) => list.map(e => e.name);
const has = (result, name) => names(result.allowedCatalog).includes(name);
const tagsOf = (result) => result.allowedCatalog.map(e => getExerciseTags(e.name)).filter(Boolean);

describe('levels', () => {
  it.each(LEVELS)('%s: volume and difficulty come from LEVEL_RULES', (level) => {
    const { brief } = run({ level });
    const L = LEVEL_RULES[level];
    expect(brief.level).toBe(level);
    expect(brief.exercisesPerDay).toEqual(L.exercisesPerDay);
    expect(brief.compoundLiftsPerDay).toEqual(L.compoundLiftsPerDay);
    expect(brief.setsPerExercise).toEqual(L.setsPerExercise);
    expect(brief.weeklySets).toEqual({ large: L.weeklySetsLargeMuscle, small: L.weeklySetsSmallMuscle });
    expect(brief.difficultyCap).toBe(L.maxDifficulty);
    expect(brief.impactCap).toBeNull();
    tagsOf(run({ level })).forEach(t => expect(t.difficulty).toBeLessThanOrEqual(L.maxDifficulty));
  });

  it('days above the level maximum are kept, with a warning (change 2b)', () => {
    const r = run({ level: 'beginner', options: { days: 5 } });
    expect(r.brief.days).toBe(5);
    expect(r.warnings.join(' ')).toMatch(/5 training days is above the usual maximum of 3 for a beginner/);
    expect(run({ level: 'beginner', options: { days: 3 } }).warnings.join(' ')).not.toMatch(/training days/);
  });
});

describe('goals', () => {
  it.each(Object.entries(GOAL_RULES))('%s: reps, holds and cardio for every level', (key, g) => {
    for (const level of LEVELS) {
      const { brief } = run({ level, profile: { ...ADULT, goal: g.label } });
      expect(brief.goals).toEqual([g.label]);
      expect(brief.reps.mainLifts).toEqual(g.mainLiftReps[level]);
      expect(brief.reps.accessories).toEqual(g.accessoryReps[level]);
      expect(brief.reps.holdSeconds).toEqual(g.holdSeconds[level]);
      expect(brief.cardio.minutes).toEqual(g.cardio.minutes);
      expect(brief.cardio.required).toBe(g.cardio.required);
    }
  });

  it('Fat Loss intervals are Advanced-only', () => {
    expect(run({ level: 'advanced', profile: { ...ADULT, goal: 'Fat Loss' } }).brief.cardio.intervals).toEqual([15, 20]);
    expect(run({ level: 'intermediate', profile: { ...ADULT, goal: 'Fat Loss' } }).brief.cardio.intervals).toBeNull();
  });

  it('Gut Health maps to General Fitness (core every day)', () => {
    const { brief } = run({ profile: { ...ADULT, goal: 'Gut Health' } });
    expect(brief.goals).toEqual(['General Fitness']);
    expect(brief.cardio.coreEveryDay).toBe(true);
  });

  it('two goals: the first sets reps, the second only adds its cardio', () => {
    const { brief } = run({ profile: { ...ADULT, goal: 'Muscle Building + Fat Loss' } });
    expect(brief.goals).toEqual(['Muscle Building', 'Fat Loss']);
    expect(brief.reps.mainLifts).toEqual(GOAL_RULES.muscleBuilding.mainLiftReps.intermediate);
    expect(brief.reps.accessories).toEqual(GOAL_RULES.muscleBuilding.accessoryReps.intermediate);
    expect(brief.cardio).toMatchObject({ goal: 'Fat Loss', required: true, minutes: [10, 15] });

    const reversed = run({ profile: { ...ADULT, goals: ['Fat Loss', 'Muscle Building'] } }).brief;
    expect(reversed.reps.mainLifts).toEqual(GOAL_RULES.fatLoss.mainLiftReps.intermediate);
    expect(reversed.cardio).toMatchObject({ goal: 'Muscle Building', required: false });
  });
});

describe('age bands', () => {
  const at = (age, level = 'beginner') => run({ level, profile: { ...ADULT, age } });

  it('under 18: impact low, difficulty 2, at least 8 reps on every lift', () => {
    const { brief } = at(16, 'advanced');
    expect(brief.impactCap).toBe('low');
    expect(brief.difficultyCap).toBe(2);
    expect(brief.reps.mainLifts[0]).toBeGreaterThanOrEqual(8);
    expect(brief.reps.accessories[0]).toBeGreaterThanOrEqual(8);
    tagsOf(at(16, 'advanced')).forEach(t => expect(t.impact).not.toBe('high'));
  });

  it('18–44: no age rule', () => {
    const { brief } = at(44, 'advanced');
    expect(brief.age.band).toBe('18–44');
    expect(brief.impactCap).toBeNull();
    expect(brief.difficultyCap).toBe(3);
    expect(brief.reps.mainLifts).toEqual(GOAL_RULES.muscleBuilding.mainLiftReps.advanced);
  });

  it('45–59: low impact, difficulty 2, 8+ reps on main lifts, core/mobility daily', () => {
    const { brief } = at(50, 'intermediate');
    expect(brief.impactCap).toBe('low');
    expect(brief.difficultyCap).toBe(2);
    expect(brief.reps.mainLifts[0]).toBeGreaterThanOrEqual(8);
    expect(brief.age.perDay).toEqual(['coreStabilityOrMobility']);
  });

  it('45–59 Advanced: no impact cap, difficulty 3', () => {
    const { brief } = at(50, 'advanced');
    expect(brief.impactCap).toBeNull();
    expect(brief.difficultyCap).toBe(3);
    expect(brief.reps.mainLifts).toEqual([8, 10]); // 6–10 floored to 8
  });

  it('60+: no impact, 10–15 reps, balance daily, machines, no barbell overhead or Olympic lifts', () => {
    const r = at(65, 'intermediate');
    expect(r.brief.impactCap).toBe('none');
    expect(r.brief.difficultyCap).toBe(2);
    expect(r.brief.reps.mainLifts).toEqual([10, 15]);
    expect(r.brief.reps.accessories).toEqual([10, 15]);
    expect(r.brief.age).toMatchObject({ perDay: ['balance'], preferMachines: true });
    ['Military Press', 'Push Press', 'Clean and Press'].forEach(n => expect(has(r, n), n).toBe(false));
    tagsOf(r).forEach(t => expect(t.impact).toBe('none'));
    expect(at(65, 'beginner').brief.difficultyCap).toBe(1);
  });

  it('60+ lifted by the coach still drops the named lifts', () => {
    const r = run({ level: 'advanced', profile: { ...ADULT, age: 65 }, options: { liftSafetyCaps: true } });
    expect(r.brief.impactCap).toBeNull();
    expect(has(r, 'Push Press')).toBe(false);
    expect(r.excluded.find(e => e.name === 'Push Press').reasons).toEqual(['age']);
  });
});

describe('BMI bands', () => {
  const bmiRun = (weightKg, level = 'beginner') => run({ level, profile: { ...ADULT, weightKg } });

  it('computes BMI from height and weight', () => {
    expect(computeBmi(175, 70)).toBe(22.9);
    expect(computeBmi(175, null)).toBeNull();
  });

  it('under 30: no change', () => {
    const { brief } = bmiRun(85); // 27.8
    expect(brief.bmi.band).toBe('Under 30');
    expect(brief.impactCap).toBeNull();
  });

  it('30–34.9: impact capped at low, cross trainer / cycling / incline walk', () => {
    const r = bmiRun(100); // 32.7
    expect(r.brief.bmi.band).toBe('30–34.9');
    expect(r.brief.impactCap).toBe('low');
    expect(r.brief.cardio.preferred).toEqual(['Cross Trainer', 'Cycling', 'Incline Walk']);
    ['Burpee', 'Box jump', 'High Knees', 'Running'].forEach(n => expect(has(r, n), n).toBe(false));
  });

  it('35+: no impact, no floor-to-standing, only incline/knee push-ups', () => {
    const r = bmiRun(110, 'intermediate'); // 35.9
    expect(r.brief.impactCap).toBe('none');
    expect(r.brief.bmi.preferSupported).toBe(true);
    ['Push Up', 'Diamond Push-up', 'Inch Worm'].forEach(n => expect(has(r, n), n).toBe(false));
    ['Incline Push-up', 'Knee Push-ups'].forEach(n => expect(has(r, n), n).toBe(true));
  });

  it('BMI rules skip Advanced (change 2c)', () => {
    const { brief } = bmiRun(110, 'advanced');
    expect(brief.bmi).toBeNull();
    expect(brief.impactCap).toBeNull();
  });
});

describe('injuries', () => {
  it.each(Object.keys(INJURY_AREAS))('%s: drops every exercise loading the joint, keeps the substitutes', (area) => {
    const r = run({ level: 'advanced', injuryAreas: [area] });
    const joints = INJURY_AREAS[area].joints;
    tagsOf(r).forEach(t => expect(t.joints.some(j => joints.includes(j)), t.name).toBe(false));
    const dropped = EXERCISE_TAGS.filter(([, , , js]) => js.some(j => joints.includes(j))).map(([n]) => n);
    dropped.forEach(n => expect(has(r, n), n).toBe(false));
    expect(dropped.length).toBeGreaterThan(0);
    expect(r.preferred[area].length).toBeGreaterThan(0);
    r.preferred[area].forEach(n => expect(has(r, n), n).toBe(true));
    expect(r.brief.injuries).toEqual([area]);
  });

  it('several areas combine', () => {
    const r = run({ level: 'advanced', injuryAreas: ['knee', 'shoulder'] });
    expect(has(r, 'Bulgarian Split Squat')).toBe(false);
    expect(has(r, 'Military Press')).toBe(false);
    expect(Object.keys(r.preferred)).toEqual(['knee', 'shoulder']);
  });

  it('free text that matches no area excludes nothing and warns', () => {
    const r = run({ level: 'advanced', options: { injuryText: 'tennis elbow-ish, old' } });
    expect(r.warnings).toContain(INJURY_UNMATCHED_WARNING);
    expect(r.excluded).toEqual([]);
  });

  it('untagged custom exercises stay, and are flagged when there is an injury', () => {
    const r = run({ injuryAreas: ['shoulder'] });
    expect(has(r, CUSTOM.name)).toBe(true);
    expect(r.brief.flagUntagged).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/1 exercise in your library has no safety tags/);
    const plain = run();
    expect(has(plain, CUSTOM.name)).toBe(true);
    expect(plain.brief.flagUntagged).toBe(false);
    expect(plain.warnings.join(' ')).not.toMatch(/safety tags/);
  });
});

describe('missing data (section 7)', () => {
  it('experience: experience → library_level → coach pick, never a Beginner default', () => {
    expect(resolveLevel({ experience: 'Advanced', libraryLevel: 'beginner' }, 'intermediate')).toEqual({ level: 'advanced', source: 'experience' });
    expect(resolveLevel({ libraryLevel: 'beginner' }, 'advanced')).toEqual({ level: 'beginner', source: 'library_level' });
    expect(resolveLevel({}, 'Intermediate')).toEqual({ level: 'intermediate', source: 'coachPick' });
    const none = buildProgrammingBrief({ profile: ADULT, catalog: CATALOG });
    expect(none.brief).toBeNull();
    expect(none.warnings[0]).toMatch(/No training level/);
  });

  it('age missing: no age rule', () => {
    const r = run({ profile: { ...ADULT, age: null } });
    expect(r.brief.age).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/Age missing/);
  });

  it('sex missing: no rule, nothing changes', () => {
    const a = run({ profile: { ...ADULT, sex: '' } });
    const b = run();
    expect(a.brief.client.sex).toBeNull();
    expect(names(a.allowedCatalog)).toEqual(names(b.allowedCatalog));
    expect(a.brief.gluteEmphasis).toBe(0);
    expect(run({ profile: { ...ADULT, sex: 'female' } }).brief.gluteEmphasis).toBe(0); // flag off (2e)
  });

  it('weight or height missing: no BMI rule and no weight sent (change 2d)', () => {
    const noWeight = run({ level: 'beginner', profile: { ...ADULT, weightKg: undefined } });
    expect(noWeight.brief.client.weightKg).toBeNull();
    expect(noWeight.brief.bmi).toBeNull();
    expect(noWeight.warnings.join(' ')).toMatch(/BMI not used: weight missing/);
    const noHeight = run({ level: 'beginner', profile: { ...ADULT, heightCm: 0, weightKg: 140 } });
    expect(noHeight.brief.bmi).toBeNull();
    expect(noHeight.brief.impactCap).toBeNull();
  });

  it('goal missing: General Fitness', () => {
    const r = run({ profile: { ...ADULT, goal: '' } });
    expect(r.brief.goals).toEqual(['General Fitness']);
    expect(r.warnings.join(' ')).toMatch(/No goal set/);
  });

  it('injuries missing: none excluded', () => {
    expect(run({ level: 'advanced' }).excluded).toEqual([]);
  });

  it('equipment missing: full gym; "home" keeps only home kit', () => {
    expect(run({ level: 'advanced' }).excluded.some(e => e.reasons.includes('equipment'))).toBe(false);
    const home = run({ level: 'advanced', options: { equipment: 'home' } });
    tagsOf(home).forEach(t => expect(['dumbbell', 'kettlebell', 'band', 'bodyweight']).toContain(t.equipment));
    expect(has(home, 'Leg Press')).toBe(false);
  });
});

describe('conflict order (section 8)', () => {
  it('impact: the strictest of age and BMI applies', () => {
    // 50 y/o beginner (age: low) with BMI 35.9 (none) → none.
    expect(run({ level: 'beginner', profile: { ...ADULT, age: 50, weightKg: 110 } }).brief.impactCap).toBe('none');
    // 16 y/o (age: low) with BMI 27.8 (no cap) → low.
    expect(run({ level: 'beginner', profile: { ...ADULT, age: 16, weightKg: 85 } }).brief.impactCap).toBe('low');
  });

  it('difficulty: the strictest of age and level applies', () => {
    expect(run({ level: 'advanced', profile: { ...ADULT, age: 65 } }).brief.difficultyCap).toBe(2);
    expect(run({ level: 'beginner', profile: { ...ADULT, age: 50 } }).brief.difficultyCap).toBe(1);
  });

  it('the coach can lift age/BMI caps, but not the level cap', () => {
    const r = run({ level: 'intermediate', profile: { ...ADULT, age: 65, weightKg: 110 }, options: { liftSafetyCaps: true } });
    expect(r.brief.impactCap).toBeNull();
    expect(r.brief.difficultyCap).toBe(2);
    expect(r.brief.safetyCapsLifted).toBe(true);
    expect(has(r, 'Running')).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/caps lifted/);
  });

  it('injury exclusions win even when the coach lifts the caps', () => {
    const r = run({ level: 'advanced', profile: { ...ADULT, age: 65 }, injuryAreas: ['knee'], options: { liftSafetyCaps: true } });
    expect(has(r, 'Running')).toBe(false);
    expect(has(r, 'Leg Press')).toBe(false);
    expect(r.excluded.find(e => e.name === 'Running').reasons).toEqual(['injury:knee']);
  });
});

describe('thin muscle groups (rule 4)', () => {
  it('keeps the filter and warns when a group drops below 3', () => {
    const r = run({ level: 'beginner', profile: { ...ADULT, age: 65 }, injuryAreas: ['knee'] });
    expect(r.brief.thinMuscles).toContain('Quads');
    expect(r.warnings.join(' ')).toMatch(/No usable Quads exercises left/);
    expect(r.warnings.join(' ')).toMatch(/Only 1 usable Calves exercise left/);
    tagsOf(r).forEach(t => expect(t.joints).not.toContain('knee'));
  });

  it('does not warn when nothing is filtered', () => {
    expect(run({ level: 'advanced' }).brief.thinMuscles).toEqual([]);
  });
});

describe('62-year-old beginner, knee injury, BMI 33', () => {
  // 170 cm, 95.4 kg → BMI 33.0
  const r = buildProgrammingBrief({
    profile: { age: 62, heightCm: 170, weightKg: 95.4, sex: 'female', goal: 'Fat Loss' },
    options: { days: 3 },
    level: 'beginner',
    injuryAreas: ['knee'],
    catalog: CATALOG
  });

  it('takes the strictest caps: no impact (age) over low (BMI), difficulty 1', () => {
    expect(r.brief.bmi).toMatchObject({ value: 33, band: '30–34.9' });
    expect(r.brief.age.band).toBe('60+');
    expect(r.brief.impactCap).toBe('none');
    expect(r.brief.difficultyCap).toBe(1);
  });

  it('uses the 60+ reps and Fat Loss cardio; BMI cardio choices the age cap removed are dropped', () => {
    expect(r.brief.reps.mainLifts).toEqual([10, 15]);
    expect(r.brief.reps.accessories).toEqual([10, 15]);
    // BMI 30–34.9 suggests Cross Trainer / Cycling / Incline Walk, but the
    // 60+ 'none' impact cap removes the two standing ones.
    expect(r.brief.cardio).toMatchObject({ goal: 'Fat Loss', required: true, preferred: ['Cycling'] });
  });

  it('keeps only seated/supported, easy, knee-free exercises', () => {
    tagsOf(r).forEach(t => {
      expect(t.impact, t.name).toBe('none');
      expect(t.difficulty, t.name).toBe(1);
      expect(t.joints, t.name).not.toContain('knee');
    });
    expect(has(r, 'Leg Press')).toBe(false);
    expect(has(r, 'Glute Bridge')).toBe(true);
  });

  it('suggests only knee substitutes that survived every filter', () => {
    expect(r.preferred.knee).toEqual(['Glute Bridge', 'Leg Curl (Lying)', 'Seated Leg Curl  Machine', 'Cycling']);
  });

  it('warns about thin groups and untagged exercises', () => {
    expect(r.brief.thinMuscles.length).toBeGreaterThan(0);
    expect(r.warnings.join(' ')).toMatch(/safety tags/);
  });
});

describe('purity', () => {
  it('same input, same output; the catalog is not mutated', () => {
    const before = JSON.stringify(CATALOG);
    const input = { profile: { ...ADULT, age: 62 }, level: 'beginner', injuryAreas: ['knee'], catalog: CATALOG };
    expect(buildProgrammingBrief(input)).toEqual(buildProgrammingBrief(input));
    expect(JSON.stringify(CATALOG)).toBe(before);
  });

  it('impact order is none < low < high', () => {
    expect(IMPACT_ORDER).toEqual(['none', 'low', 'high']);
  });
});
