// AI Workout Builder — programming rules (SOURCE OF TRUTH).
//
// Plain data, no logic. Every number the programming brief uses comes from
// this file, so editing a value here changes what the AI Draft Builder does.
// The readable version is docs/ai-programming-rules.md — keep the two in step
// when you edit (aiProgrammingRules.test.js checks the shape, not the prose).
//
// Ranges are [min, max]. Level keys are 'beginner' | 'intermediate' |
// 'advanced'. Impact values are 'none' | 'low' | 'high' and a cap means
// "this value and below are allowed" (cap 'low' allows none + low). null
// means "no rule". Exercise names must be spelled as in the catalog
// (src/data/exerciseTags.js) — the test fails on a name it can't find.
//
// These are standard strength-training defaults (ACSM/NSCA-style), not
// medical advice: for a real injury the coach (or the client's physio) has
// the final say.

export const LEVELS = ['beginner', 'intermediate', 'advanced'];

// Ordered from least to most impact — decides which cap is the strictest.
export const IMPACT_ORDER = ['none', 'low', 'high'];

// What each impact cap lets through (exercise impact tags) and the rule the
// model is given. Coach decision 2026-11-11: a 'none' ("no impact") cap keeps
// standing moves with both feet down and only asks for seated / supported
// ones to be preferred. Allowing seated/lying/supported only left a 60+
// beginner with a knee injury and home kit 48 of 314 exercises, the same
// day twice and no cardio (walking is a standing move).
export const IMPACT_CAPS = {
  low: {
    allows: ['none', 'low'],
    preferSupported: false,
    rule: 'No jumps, landings or running (impact capped at low).'
  },
  none: {
    allows: ['none', 'low'],
    preferSupported: true,
    rule: 'No impact: no jumps, landings or running. Standing exercises with both feet down are fine, but prefer seated, lying or supported ones.'
  }
};

// ─── 1. Experience levels ───────────────────────────────────────────────────
export const LEVEL_RULES = {
  beginner: {
    maxDaysPerWeek: 3,
    defaultSplit: 'Full Body',
    exercisesPerDay: [4, 5],
    compoundLiftsPerDay: [2, 2],
    setsPerExercise: [2, 3],
    weeklySetsLargeMuscle: { target: 8, cap: 10 },
    weeklySetsSmallMuscle: { target: 4, cap: 6 },
    maxDifficulty: 1,
    minRestHoursSameMuscle: 48
  },
  intermediate: {
    maxDaysPerWeek: 5,
    defaultSplit: 'Upper/Lower or Push/Pull/Legs',
    exercisesPerDay: [5, 6],
    compoundLiftsPerDay: [2, 3],
    setsPerExercise: [3, 3],
    weeklySetsLargeMuscle: { target: 12, cap: 16 },
    weeklySetsSmallMuscle: { target: 8, cap: 10 },
    maxDifficulty: 2,
    minRestHoursSameMuscle: 48
  },
  advanced: {
    maxDaysPerWeek: 6,
    defaultSplit: 'Push/Pull/Legs or body-part',
    exercisesPerDay: [6, 7],
    compoundLiftsPerDay: [3, 3],
    setsPerExercise: [3, 4],
    weeklySetsLargeMuscle: { target: 16, cap: 20 },
    weeklySetsSmallMuscle: { target: 10, cap: 14 },
    maxDifficulty: 3,
    minRestHoursSameMuscle: 48
  }
};

export const MUSCLE_SIZE = {
  large: ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes'],
  small: ['biceps', 'triceps', 'calves', 'forearms', 'core']
};

// Change 2b: the coach's explicit day count wins over maxDaysPerWeek. Days
// are never cut — the coach gets this warning instead.
export const TRAINING_DAYS = {
  coachChoiceWins: true,
  overMaxWarning: '{days} training days is above the usual maximum of {max} for {aLevel} client. Kept as you asked — watch recovery.'
};

// ─── 2. Rep ranges by goal and level ────────────────────────────────────────
// Holds are seconds per set. Cardio minutes are per day.
const HOLDS_SECONDS = { beginner: [20, 30], intermediate: [30, 45], advanced: [45, 60] };

export const GOAL_RULES = {
  fatLoss: {
    label: 'Fat Loss',
    mainLiftReps: { beginner: [10, 12], intermediate: [8, 12], advanced: [6, 10] },
    accessoryReps: { beginner: [12, 15], intermediate: [12, 15], advanced: [10, 15] },
    holdSeconds: HOLDS_SECONDS,
    cardio: {
      required: true,
      minutes: [10, 15],
      style: 'easy cardio to finish every day',
      advancedIntervals: { allowed: true, minutes: [15, 20] }
    },
    coreEveryDay: false
  },
  muscleBuilding: {
    label: 'Muscle Building',
    mainLiftReps: { beginner: [10, 12], intermediate: [8, 10], advanced: [6, 10] },
    accessoryReps: { beginner: [12, 15], intermediate: [10, 12], advanced: [8, 12] },
    holdSeconds: HOLDS_SECONDS,
    cardio: { required: false, minutes: [0, 10], style: 'optional', advancedIntervals: null },
    coreEveryDay: false
  },
  generalFitness: {
    label: 'General Fitness',
    mainLiftReps: { beginner: [10, 12], intermediate: [10, 12], advanced: [8, 12] },
    accessoryReps: { beginner: [12, 15], intermediate: [12, 15], advanced: [12, 15] },
    holdSeconds: HOLDS_SECONDS,
    cardio: { required: true, minutes: [10, 15], style: 'steady cardio', advancedIntervals: null },
    coreEveryDay: true
  }
};

// Profile goal text → GOAL_RULES key. Checked in order; first match wins.
// Anything unmatched (or missing) falls back to MISSING_DATA.goal.
export const GOAL_ALIASES = [
  { match: 'fat|loss|lean|cut|weight', goal: 'fatLoss' },
  { match: 'muscle|build|hypertroph|bulk|mass|strength', goal: 'muscleBuilding' },
  { match: 'gut|general|fitness|health|tone', goal: 'generalFitness' }
];

// Two goals picked: the first decides reps, the second only adds its cardio.
export const TWO_GOALS = { repsFrom: 'first', cardioFrom: 'second' };

// ─── 3. Age bands ───────────────────────────────────────────────────────────
// minAge inclusive, maxAge inclusive (null = open). impactCap / maxDifficulty
// are per level; null = no cap from age (the level's own cap applies).
export const AGE_BANDS = [
  {
    label: 'Under 18', minAge: null, maxAge: 17,
    impactCap: { beginner: 'low', intermediate: 'low', advanced: 'low' },
    maxDifficulty: { beginner: 2, intermediate: 2, advanced: 2 },
    minRepsAllLifts: 8, minRepsMainLifts: null, repRange: null,
    perDay: [], preferMachines: false, excludeExercises: []
  },
  {
    label: '18–44', minAge: 18, maxAge: 44,
    impactCap: { beginner: null, intermediate: null, advanced: null },
    maxDifficulty: { beginner: null, intermediate: null, advanced: null },
    minRepsAllLifts: null, minRepsMainLifts: null, repRange: null,
    perDay: [], preferMachines: false, excludeExercises: []
  },
  {
    label: '45–59', minAge: 45, maxAge: 59,
    impactCap: { beginner: 'low', intermediate: 'low', advanced: null },
    maxDifficulty: { beginner: 2, intermediate: 2, advanced: 3 },
    minRepsAllLifts: null, minRepsMainLifts: 8, repRange: null,
    perDay: ['coreStabilityOrMobility'], preferMachines: false, excludeExercises: []
  },
  {
    label: '60+', minAge: 60, maxAge: null,
    impactCap: { beginner: 'none', intermediate: 'none', advanced: 'none' },
    maxDifficulty: { beginner: 1, intermediate: 2, advanced: 2 },
    minRepsAllLifts: null, minRepsMainLifts: null, repRange: [10, 15],
    perDay: ['balance'], preferMachines: true,
    // No barbell overhead press, no Olympic-style lifts (jumping is already
    // gone with the 'none' impact cap).
    excludeExercises: [
      'Overhead Press (Barbell)', 'Military Press', 'Shoulder Press (Barbell)', 'Behind Neck Press',
      'Push Press', 'Clean and Press', 'single arm clean and press dumbbells', 'single arm clean and press kettlebell',
      'Clean to Rotate Press(landline)'
    ]
  }
];

// ─── 4. BMI bands ───────────────────────────────────────────────────────────
// Change 2c: BMI rules apply to these levels only (not Advanced).
// If height or weight is missing, no BMI rule applies.
export const BMI = {
  appliesToLevels: ['beginner', 'intermediate'],
  bands: [
    { label: 'Under 30', minBmi: null, maxBmi: 29.9, impactCap: null, preferredCardio: [], preferSupported: false, excludeExercises: [] },
    {
      label: '30–34.9', minBmi: 30, maxBmi: 34.9, impactCap: 'low',
      preferredCardio: ['Cross Trainer', 'Cycling', 'Incline Walk'],
      preferSupported: false, excludeExercises: []
    },
    {
      label: '35 and over', minBmi: 35, maxBmi: null, impactCap: 'none',
      // Seated first (preferSupported), then a gentle standing option.
      preferredCardio: ['Cycling', 'Air Rowing', 'Incline Walk'],
      preferSupported: true,
      // No fast floor-to-standing moves; push-ups only as incline or knee
      // versions (Incline Push-up, Incline knee push ups, Knee Push-ups stay).
      excludeExercises: [
        'Burpee', 'Burpee Broad Jump', 'Lateral Jump Burpees', 'Inch Worm', 'Wall Ball',
        'Push Up', 'Push-up (Wide Grip)', 'Diamond Push-up', 'Deficit Push-Up', 'Decline Push-up',
        'Explosive / Plyometric Push-Up', 'Ring Push-Up', 'Plank push ups'
      ]
    }
  ]
};

// ─── 5. Sex ─────────────────────────────────────────────────────────────────
// Default: no rule. Sex is still sent to the AI for phrasing.
// Change 2e: the female glute emphasis stays OFF behind this flag.
export const SEX_RULES = {
  sendToModel: true,
  femaleGluteEmphasis: {
    enabled: false,
    minGluteExercisesOnLowerDay: 1
  }
};

// ─── 6. Injuries ────────────────────────────────────────────────────────────
// Each area excludes every catalog exercise tagged with any of its joints
// (src/data/exerciseTags.js), plus `alsoExclude` by name. Preferred
// substitutes are suggested to the model; they must not carry the area's
// joint tag (the test checks this).
// `keywords` match the coach's free-text injury note to areas (whole words,
// case-insensitive) — used to pre-tick the boxes and, for an older cached
// client that sends no ticks, to pick the areas on the server.
export const INJURY_AREAS = {
  lowerBack: {
    label: 'Lower back',
    keywords: ['lower back', 'low back', 'lumbar', 'sciatica', 'disc', 'herniated', 'spine', 'spinal', 'l4', 'l5'],
    joints: ['lumbar'],
    alsoExclude: [],
    preferred: ['Chest-Supported Dumbbell', 'Seated Cable Row', 'Leg Press', 'Goblet Squat', 'Hip Thrust', 'Glute Bridge', 'Bird dog', 'Dead Bug', 'Pallof Press', 'Side Plank']
  },
  knee: {
    label: 'Knee',
    keywords: ['knee', 'knees', 'acl', 'mcl', 'meniscus', 'patella', 'patellar'],
    joints: ['knee'],
    alsoExclude: [],
    preferred: ['Box Squat', 'Hip Thrust', 'Glute Bridge', 'Leg Curl (Lying)', 'Seated Leg Curl  Machine', 'Romanian Deadlift', 'Cycling']
  },
  shoulder: {
    label: 'Shoulder',
    keywords: ['shoulder', 'shoulders', 'rotator cuff', 'rotator', 'impingement', 'labrum', 'frozen shoulder', 'ac joint'],
    joints: ['shoulder'],
    alsoExclude: [],
    preferred: ['Landmine Press', 'Floor Press', 'Seated Cable Row', 'Face Pull', 'External Rotation (Cable)', 'External Rotation (Band)']
  },
  wristElbow: {
    label: 'Wrist / elbow',
    keywords: ['wrist', 'wrists', 'elbow', 'elbows', 'tennis elbow', 'golfer', 'golfers', 'carpal', 'forearm'],
    joints: ['wrist'],
    alsoExclude: [],
    preferred: ['Plank', 'Hammer Curl (Dumbbell)', 'EZ Bar Curl', 'Cable Curl', 'Chest Press (Machine)']
  },
  hip: {
    label: 'Hip',
    keywords: ['hip', 'hips', 'groin', 'labral', 'piriformis'],
    joints: ['hip'],
    alsoExclude: [],
    preferred: ['Glute Bridge', 'Leg Press', 'Leg Curl (Lying)', 'Cable Pull Through']
  },
  neck: {
    label: 'Neck',
    keywords: ['neck', 'cervical', 'whiplash'],
    joints: ['neck'],
    alsoExclude: [],
    preferred: ['Dead Bug', 'Plank', 'Pallof Press']
  }
};

export const INJURY_UNMATCHED_WARNING = "Couldn't match this injury to a body area. Check the exercises yourself.";

// ─── Untagged exercises (coach custom exercises, new catalog rows) ──────────
// Never auto-excluded. Flagged to the coach in the draft when the client has
// an injury or any impact cap is in force.
export const UNTAGGED = {
  autoExclude: false,
  flagWhen: { injury: true, impactCap: true },
  coachWarning: '{name} has no safety tags (custom or new exercise) — check it suits this client.'
};

// ─── 7. Defaults when data is missing ───────────────────────────────────────
export const MISSING_DATA = {
  // Change 2a: never default to Beginner. Use the first source that is set;
  // 'coachPick' is the level the coach picks at generation time (required
  // field in Part 3).
  experienceFrom: ['experience', 'library_level', 'coachPick'],
  // Age missing → no age rule. Sex missing → no rule.
  // Change 2d: height or weight missing → no BMI rule and no weight sent
  // (never a placeholder 70 kg).
  sendWeightWhenMissing: false,
  goal: 'generalFitness',
  injuries: [],
  equipment: 'fullGym'
};

// Equipment presets → allowed equipment tags (null = everything).
export const EQUIPMENT_PRESETS = {
  fullGym: null,
  home: ['dumbbell', 'kettlebell', 'band', 'bodyweight']
};

// After filtering, a muscle group with fewer usable exercises than this gets
// a coach warning (the filter is kept). Groups that had fewer than this
// before filtering are not warned about.
export const MIN_EXERCISES_PER_MUSCLE = 3;

export const BRIEF_WARNINGS = {
  noLevel: 'No training level: set the client\'s experience or pick a level before generating.',
  lowMuscle: 'Only {count} usable {muscle} exercise{s} left after the client\'s restrictions{names}. The draft may repeat them or skip {muscle} — check it.',
  noMuscle: 'No usable {muscle} exercises left after the client\'s restrictions, so the draft won\'t train {muscle} directly. Add one by hand if it\'s needed.',
  capsLifted: 'Age/BMI safety caps lifted by your instructions — level and injury rules still apply.',
  missingFields: 'Missing from the client\'s profile: {fields}. Fill {them} in for a better fit.',
  missingEffects: { age: 'age (no age rules)', sex: 'sex', height: 'height (no BMI rule)', weight: 'weight (no BMI rule)', goal: 'goal (using General Fitness)' },
  removed: '{day}: removed {name} ({why}).',
  clamped: '{day}: sets/reps adjusted on {count} exercise{s} to fit the client\'s ranges.',
  overCap: '{muscle}: {sets} sets this week, above the {cap}-set cap for {aLevel} client. Consider trimming one {muscle} exercise.',
  untaggedInDraft: '{day}: {name} has no safety tags (custom or new exercise) — check it suits this client.',
  shortDay: '{day}: only {count} exercise{s} (this client\'s range is {min} to {max}) — add one or regenerate this day.',
  noCardioInDay: '{day}: no cardio finisher, though {goal} calls for {min} to {max} min every day — add one or regenerate this day.',
  equipmentHome: 'Equipment read as home kit: dumbbells, kettlebells, bands and bodyweight only.',
  noCardio: '{goal} calls for cardio every day, but no cardio exercise in your library fits this client\'s limits, so the draft has none. Add one by hand (e.g. a seated bike) if it suits them.'
};

// Why an exercise was removed, as the coach reads it.
export const EXCLUSION_REASON_TEXT = {
  impact: 'impact limit', difficulty: 'too advanced for the level', equipment: 'equipment not available',
  age: 'age rule', bmi: 'BMI rule'
};

// ─── 8. When rules conflict (highest priority first) ────────────────────────
// Injury exclusions can't be overridden by coach instructions; the safety caps
// (age, BMI) can. For impact and difficulty the strictest of age, BMI and
// level applies.
export const CONFLICT_PRIORITY = ['injury', 'safetyCaps', 'coachInstructions', 'goal', 'level', 'advancedOptions'];
export const COACH_CAN_OVERRIDE = { injury: false, safetyCaps: true };
export const COMBINE_CAPS = 'strictest';

// ─── 9. Exercise tag vocabulary (the tags live in exerciseTags.js) ──────────
export const TAG_VALUES = {
  impact: ['none', 'low', 'high'],
  difficulty: [1, 2, 3],
  joints: ['lumbar', 'knee', 'shoulder', 'wrist', 'hip', 'neck'],
  equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band', 'bodyweight', 'other']
};

// Rows the coach checks by hand first (review CSV order).
export const REVIEW_RISK = { impact: ['high'], difficulty: [3], joints: ['lumbar', 'knee', 'shoulder'] };
