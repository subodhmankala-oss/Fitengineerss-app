// The AI Draft Builder's "programming brief": what one client's program must
// look like, computed from their profile with the rules in
// src/data/aiProgrammingRules.js and the tags in src/data/exerciseTags.js.
//
// Pure: no network, no database, no clock, no randomness — the same input
// always gives the same brief. Shared by the browser (to show the coach what
// will be applied) and the api/ function (to build the prompt and check the
// model's output), so plain ES modules only.
//
// buildProgrammingBrief({ profile, options, level, injuryAreas, catalog })
//   profile      { age, heightCm, weightKg, sex, goal | goals, experience, libraryLevel }
//   options      { days, equipment, liftSafetyCaps, injuryText }
//                  equipment: an EQUIPMENT_PRESETS key or a list of tags
//                  liftSafetyCaps: the coach's instructions lift the age/BMI
//                  impact and difficulty caps (never injury exclusions)
//   level        the level the coach picked at generation time
//   injuryAreas  ticked INJURY_AREAS keys
//   catalog      [{ name, muscle, category, id? }] (aiWorkoutCatalog shape)
// returns { brief, allowedCatalog, excluded, preferred, warnings }

import {
  LEVELS, IMPACT_ORDER, LEVEL_RULES, TRAINING_DAYS, GOAL_RULES, GOAL_ALIASES, TWO_GOALS,
  AGE_BANDS, BMI, SEX_RULES, INJURY_AREAS, INJURY_UNMATCHED_WARNING, UNTAGGED, MISSING_DATA,
  EQUIPMENT_PRESETS, MIN_EXERCISES_PER_MUSCLE, BRIEF_WARNINGS, COACH_CAN_OVERRIDE
} from '../data/aiProgrammingRules.js';
import { getExerciseTags } from './exerciseTags.js';
import { exerciseNameKey } from './exerciseName.js';
import { getMuscleGroupsForExercise, parseMuscleText, OPTIONAL_MUSCLES } from './muscleGroups.js';

const fill = (template, values) =>
  template.replace(/\{(\w+)\}/g, (m, k) => (values[k] !== undefined ? String(values[k]) : m));

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function normalizeLevel(value) {
  const v = String(value || '').trim().toLowerCase();
  return LEVELS.find(l => v === l || v.startsWith(l.slice(0, 5))) || null;
}

// Section 7 + change 2a: experience → library_level → the coach's pick.
export function resolveLevel(profile = {}, coachPick = null) {
  const sources = { experience: profile.experience, library_level: profile.libraryLevel, coachPick };
  for (const source of MISSING_DATA.experienceFrom) {
    const level = normalizeLevel(sources[source]);
    if (level) return { level, source };
  }
  return { level: null, source: null };
}

const goalKey = (text) => {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  const hit = GOAL_ALIASES.find(a => new RegExp(a.match).test(t));
  return hit ? hit.goal : null;
};

// "Muscle Building + Fat Loss", ['Fat Loss', 'Muscle Building'] → keys, in
// order, deduped. Unknown text is skipped.
export function resolveGoals(profile = {}) {
  const raw = Array.isArray(profile.goals) ? profile.goals
    : String(profile.goal || '').split(/\s*(?:[+,&/]|\band\b)\s*/i);
  const keys = [];
  raw.map(goalKey).forEach(k => { if (k && !keys.includes(k)) keys.push(k); });
  return keys;
}

export const computeBmi = (heightCm, weightKg) => {
  const h = num(heightCm);
  const w = num(weightKg);
  if (!h || !w) return null;
  return Math.round((w / ((h / 100) ** 2)) * 10) / 10;
};

const inBand = (value, lo, hi) => (lo === null || value >= lo) && (hi === null || value <= hi);

export const ageBandFor = (age) => {
  const a = num(age);
  return a === null ? null : AGE_BANDS.find(b => inBand(Math.floor(a), b.minAge, b.maxAge)) || null;
};

// BMI bands step at one decimal (29.9 → 30); compare on the rounded BMI.
export const bmiBandFor = (bmi) =>
  (bmi === null ? null : BMI.bands.find(b => inBand(bmi, b.minBmi, b.maxBmi)) || null);

// Strictest of the given impact caps (null = no cap).
const strictestImpact = (caps) => caps.filter(Boolean)
  .reduce((best, c) => (best === null || IMPACT_ORDER.indexOf(c) < IMPACT_ORDER.indexOf(best) ? c : best), null);

const impactAllowed = (cap, impact) => cap === null || IMPACT_ORDER.indexOf(impact) <= IMPACT_ORDER.indexOf(cap);

const floorRange = ([lo, hi], floor) => (floor ? [Math.max(lo, floor), Math.max(hi, floor)] : [lo, hi]);

// The exercise's main muscle group (the analytics taxonomy), or 'Other'.
const muscleOf = (entry) =>
  getMuscleGroupsForExercise(entry.name)[0] || parseMuscleText(entry.muscle)[0] || 'Other';

// Equipment: a list of tags, a preset key, or the coach's free text ("Gym",
// "Home", "home, dumbbells only"). Free text reads as the home preset only
// when it says home and not gym; anything else is a full gym.
export function resolveEquipment(equipment) {
  if (Array.isArray(equipment)) return { preset: null, allow: equipment.length ? new Set(equipment) : null };
  const raw = String(equipment || '').trim();
  const key = Object.prototype.hasOwnProperty.call(EQUIPMENT_PRESETS, raw) ? raw
    : (/\bhome\b/i.test(raw) && !/\bgym\b/i.test(raw) ? 'home' : MISSING_DATA.equipment);
  const preset = EQUIPMENT_PRESETS[key];
  return { preset: key, allow: preset ? new Set(preset) : null };
}

const wordRe = (word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

// The INJURY_AREAS keys a free-text injury note mentions, in config order.
export function matchInjuryAreas(text) {
  const t = String(text || '');
  if (!t.trim()) return [];
  return Object.entries(INJURY_AREAS)
    .filter(([, area]) => (area.keywords || []).some(k => wordRe(k).test(t)))
    .map(([key]) => key);
}

export function buildProgrammingBrief({ profile = {}, options = {}, level: coachPick = null, injuryAreas = [], catalog = [] } = {}) {
  const warnings = [];

  // ── Level (section 1, change 2a) ──
  const { level, source: levelSource } = resolveLevel(profile, coachPick);
  if (!level) {
    return { brief: null, allowedCatalog: [], excluded: [], preferred: {}, warnings: [BRIEF_WARNINGS.noLevel] };
  }
  const L = LEVEL_RULES[level];

  // ── Days (change 2b): the coach's count wins, with a warning ──
  const days = num(options.days) ? Math.round(num(options.days)) : null;
  if (days && days > L.maxDaysPerWeek && TRAINING_DAYS.coachChoiceWins) {
    warnings.push(fill(TRAINING_DAYS.overMaxWarning, { days, max: L.maxDaysPerWeek, level }));
  }

  // ── Goals (section 2): first sets reps, second only adds its cardio ──
  let goals = resolveGoals(profile);
  if (goals.length === 0) goals = [MISSING_DATA.goal];
  const repsGoal = GOAL_RULES[TWO_GOALS.repsFrom === 'first' ? goals[0] : goals.at(-1)];
  const cardioGoal = GOAL_RULES[goals.length > 1 && TWO_GOALS.cardioFrom === 'second' ? goals[1] : goals[0]];

  // ── Age (section 3) and BMI (section 4) ──
  const ageBand = ageBandFor(profile.age);
  const heightCm = num(profile.heightCm);
  const weightKg = num(profile.weightKg); // change 2d: never a placeholder
  const bmi = computeBmi(heightCm, weightKg);
  const bmiApplies = BMI.appliesToLevels.includes(level);
  const bmiBand = bmiApplies ? bmiBandFor(bmi) : null;
  const sex = String(profile.sex || '').trim().toLowerCase() || null;

  // Profile fields the rules wanted but didn't get — one warning, with what
  // each one costs.
  const missing = [
    !ageBand && 'age',
    !sex && 'sex',
    !heightCm && 'height',
    !weightKg && 'weight',
    resolveGoals(profile).length === 0 && 'goal'
  ].filter(Boolean);
  if (missing.length) {
    warnings.push(fill(BRIEF_WARNINGS.missingFields, {
      fields: missing.map(f => BRIEF_WARNINGS.missingEffects[f]).join(', '),
      them: missing.length === 1 ? 'it' : 'them'
    }));
  }

  // ── Caps (section 8): strictest of age, BMI, level; coach may lift age/BMI ──
  const liftCaps = Boolean(options.liftSafetyCaps) && COACH_CAN_OVERRIDE.safetyCaps;
  if (liftCaps && (ageBand || bmiBand)) warnings.push(BRIEF_WARNINGS.capsLifted);
  const ageImpact = ageBand?.impactCap[level] ?? null;
  const ageDifficulty = ageBand?.maxDifficulty[level] ?? null;
  const bmiImpact = bmiBand?.impactCap ?? null;
  const impactCap = liftCaps ? null : strictestImpact([ageImpact, bmiImpact]);
  const difficultyCap = Math.min(L.maxDifficulty, ...(liftCaps || ageDifficulty === null ? [] : [ageDifficulty]));

  // ── Reps, with the age floors / range ──
  let mainLiftReps = repsGoal.mainLiftReps[level];
  let accessoryReps = repsGoal.accessoryReps[level];
  if (ageBand?.repRange) {
    mainLiftReps = ageBand.repRange;
    accessoryReps = ageBand.repRange;
  }
  mainLiftReps = floorRange(mainLiftReps, ageBand?.minRepsAllLifts || ageBand?.minRepsMainLifts);
  accessoryReps = floorRange(accessoryReps, ageBand?.minRepsAllLifts);

  const cardio = {
    goal: cardioGoal.label,
    required: cardioGoal.cardio.required,
    minutes: cardioGoal.cardio.minutes,
    style: cardioGoal.cardio.style,
    intervals: level === 'advanced' && cardioGoal.cardio.advancedIntervals?.allowed ? cardioGoal.cardio.advancedIntervals.minutes : null,
    coreEveryDay: cardioGoal.coreEveryDay || repsGoal.coreEveryDay,
    preferred: bmiBand?.preferredCardio || []
  };

  // ── Exclusions ──
  const areas = [...new Set(injuryAreas)].filter(a => INJURY_AREAS[a]);
  const injuryJoints = new Map(); // joint → area
  areas.forEach(a => INJURY_AREAS[a].joints.forEach(j => injuryJoints.set(j, a)));
  const injuryNames = new Map();
  areas.forEach(a => INJURY_AREAS[a].alsoExclude.forEach(n => injuryNames.set(exerciseNameKey(n), a)));
  if (String(options.injuryText || '').trim() && matchInjuryAreas(options.injuryText).length === 0) {
    warnings.push(INJURY_UNMATCHED_WARNING);
  }

  const ageNames = new Set((ageBand?.excludeExercises || []).map(exerciseNameKey));
  const bmiNames = new Set((bmiBand?.excludeExercises || []).map(exerciseNameKey));
  const { preset: equipmentPreset, allow: equipment } = resolveEquipment(options.equipment);
  if (equipmentPreset === 'home') warnings.push(BRIEF_WARNINGS.equipmentHome);

  const allowedCatalog = [];
  const excluded = [];
  const untagged = [];
  for (const entry of catalog) {
    const key = exerciseNameKey(entry.name);
    const tags = getExerciseTags(entry.name);
    const reasons = [];
    if (injuryNames.has(key)) reasons.push(`injury:${injuryNames.get(key)}`);
    if (tags) {
      tags.joints.forEach(j => {
        const area = injuryJoints.get(j);
        if (area && !reasons.includes(`injury:${area}`)) reasons.push(`injury:${area}`);
      });
      if (!impactAllowed(impactCap, tags.impact)) reasons.push('impact');
      if (tags.difficulty > difficultyCap) reasons.push('difficulty');
      if (equipment && !equipment.has(tags.equipment)) reasons.push('equipment');
    } else {
      untagged.push(entry.name); // never auto-excluded (UNTAGGED.autoExclude)
    }
    if (ageNames.has(key)) reasons.push('age');
    if (bmiNames.has(key)) reasons.push('bmi');
    if (reasons.length) excluded.push({ name: entry.name, reasons });
    else allowedCatalog.push(entry);
  }

  // ── Preferred substitutes that survived the filter ──
  const allowedByKey = new Map(allowedCatalog.map(e => [exerciseNameKey(e.name), e.name]));
  cardio.preferred = cardio.preferred.map(n => allowedByKey.get(exerciseNameKey(n))).filter(Boolean);
  const preferred = {};
  areas.forEach(a => {
    preferred[a] = INJURY_AREAS[a].preferred.map(n => allowedByKey.get(exerciseNameKey(n))).filter(Boolean);
  });

  // ── Rule 4: muscle groups left too thin (filter kept, coach warned) ──
  const countBy = (list) => {
    const m = new Map();
    list.forEach(e => {
      const g = muscleOf(e);
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(e.name);
    });
    return m;
  };
  const before = countBy(catalog);
  const after = countBy(allowedCatalog);
  const thinMuscles = [];
  before.forEach((names, muscle) => {
    if (muscle === 'Other' || OPTIONAL_MUSCLES.has(muscle) || names.length < MIN_EXERCISES_PER_MUSCLE) return;
    const left = after.get(muscle) || [];
    if (left.length >= MIN_EXERCISES_PER_MUSCLE) return;
    thinMuscles.push(muscle);
    warnings.push(fill(left.length === 0 ? BRIEF_WARNINGS.noMuscle : BRIEF_WARNINGS.lowMuscle, {
      count: left.length, muscle, s: left.length === 1 ? '' : 's',
      names: left.length ? ` (${left.join(', ')})` : ''
    }));
  });

  // ── Untagged: kept; flagged per exercise in the draft (checkDraftDay) when
  // an injury or impact cap is in force ──
  const flagUntagged = (UNTAGGED.flagWhen.injury && areas.length > 0) || (UNTAGGED.flagWhen.impactCap && impactCap !== null);

  const brief = {
    level,
    levelSource,
    goals: goals.map(g => GOAL_RULES[g].label),
    days,
    defaultSplit: L.defaultSplit,
    exercisesPerDay: L.exercisesPerDay,
    compoundLiftsPerDay: L.compoundLiftsPerDay,
    setsPerExercise: L.setsPerExercise,
    reps: { mainLifts: mainLiftReps, accessories: accessoryReps, holdSeconds: repsGoal.holdSeconds[level] },
    cardio,
    impactCap,
    difficultyCap,
    weeklySets: { large: L.weeklySetsLargeMuscle, small: L.weeklySetsSmallMuscle },
    minRestHoursSameMuscle: L.minRestHoursSameMuscle,
    age: ageBand ? {
      band: ageBand.label,
      perDay: ageBand.perDay,
      preferMachines: ageBand.preferMachines,
      minRepsAllLifts: ageBand.minRepsAllLifts,
      minRepsMainLifts: ageBand.minRepsMainLifts
    } : null,
    bmi: bmiBand ? { value: bmi, band: bmiBand.label, preferSupported: bmiBand.preferSupported } : null,
    injuries: areas,
    safetyCapsLifted: liftCaps,
    gluteEmphasis: SEX_RULES.femaleGluteEmphasis.enabled && sex === 'female'
      ? SEX_RULES.femaleGluteEmphasis.minGluteExercisesOnLowerDay : 0,
    client: {
      age: num(profile.age),
      sex: SEX_RULES.sendToModel ? sex : null,
      heightCm,
      weightKg
    },
    equipment: equipmentPreset,
    missing,
    flagUntagged,
    untaggedCount: untagged.length,
    thinMuscles
  };

  return { brief, allowedCatalog, excluded, preferred, warnings };
}
