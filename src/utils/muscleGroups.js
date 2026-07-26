// ─── MUSCLE GROUP TAXONOMY ───
// Maps every exercise name to the muscle group(s) it trains, for the Weekly
// Muscle Analytics feature. Deliberately separate from exerciseLibrary.js's
// inferPrimary()/inferCategory() (used for the exercise picker's filter
// chips/subtitles) — that taxonomy is coarser (7 categories, 1 label per
// exercise) and not meant to double as a volume-tracking source of truth.
// This module targets the 11 canonical muscle groups the analytics screen
// tracks individually.
//
// Compound lifts credit BOTH a primary and secondary muscle (matching how
// real training-log apps like Hevy/Strong count sets — a Bench Press set
// counts as 1 working set for Chest AND 1 for Triceps, not a fractional
// split). Isolation lifts credit one muscle only.

export const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms',
  'Core', 'Glutes', 'Quads', 'Hamstrings', 'Calves'
];

// Push / Pull / Legs / Core categorization (Section 3 — Training Distribution).
export const MUSCLE_TO_PPLC = {
  Chest: 'Push', Shoulders: 'Push', Triceps: 'Push',
  Back: 'Pull', Biceps: 'Pull', Forearms: 'Pull',
  Glutes: 'Legs', Quads: 'Legs', Hamstrings: 'Legs', Calves: 'Legs',
  Core: 'Core'
};

// Which body-diagram view (Section 2 heat map) each muscle is most
// recognizable/visible on. Each muscle appears on exactly one view — no
// duplication — even though a few (e.g. shoulders, forearms) are partially
// visible on both in reality; this keeps the diagram clean and unambiguous.
export const MUSCLE_BODY_VIEW = {
  Chest: 'front', Shoulders: 'front', Biceps: 'front', Forearms: 'front', Core: 'front', Quads: 'front',
  Back: 'back', Triceps: 'back', Glutes: 'back', Hamstrings: 'back', Calves: 'back'
};

// "Large" muscles get the 12–20 weekly target band, "small" muscles 8–15,
// per the spec's Smart Calculations section.
export const LARGE_MUSCLES = new Set(['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Glutes']);

// Ordered, most-specific-first keyword rules. Each rule maps to either a
// single muscle string or a [primary, secondary] pair (secondary optional).
// `test` receives the lowercased exercise name.
const RULES = [
  // ── Isolation arms (checked before compound "press"/"row" rules) ──
  { test: n => /(triceps|tricep|skullcrusher|pushdown|kickback|close.?grip)/.test(n) && !/(chest dip|^dip$|bench)/.test(n), muscles: ['Triceps'] },
  // Checked before the generic "curl" rule below — "Wrist Curl" contains
  // "curl" and would otherwise be misclassified as Biceps.
  { test: n => /wrist/.test(n), muscles: ['Forearms'] },
  { test: n => /(bicep|curl)/.test(n) && !/(leg curl|hip curl|wrist curl)/.test(n), muscles: ['Biceps'] },

  // ── Legs (isolation first, then compound) ──
  { test: n => /calf/.test(n), muscles: ['Calves'] },
  { test: n => /(glute|hip thrust|glute bridge|hip abduction|hip adduction)/.test(n), muscles: ['Glutes'] },
  // "kettlebell swing" added: a hip-hinge posterior-chain move, classified
  // the same as Romanian Deadlift / Good Morning here.
  { test: n => /(hamstring|romanian|stiff.?leg|leg curl|good morning|single.?leg deadlift|kettlebell swing)/.test(n), muscles: ['Hamstrings', 'Glutes'] },
  { test: n => /(leg extension)/.test(n), muscles: ['Quads'] },
  // "box jump" added alongside "box squat" — both explosive quad/glute moves.
  { test: n => /(squat|lunge|leg press|step.?up|wall sit|split squat|hack squat|box squat|box jump)/.test(n), muscles: ['Quads', 'Glutes'] },
  { test: n => /(deadlift|rack pull|sumo)/.test(n), muscles: ['Hamstrings', 'Back'] },

  // ── Core ──
  // "ball slam" and "jumping jack" added — both full-body/conditioning moves
  // with no other clear muscle-group home in this taxonomy; classified as
  // Core, the most defensible single bucket for them.
  { test: n => /(crunch|plank|sit.?up|russian twist|leg raise|knee raise|oblique|v.?up|ab wheel|hollow|dead bug|mountain climber|ball slam|jumping jack)/.test(n), muscles: ['Core'] },
  { test: n => /(superman|hyperextension|back extension)/.test(n), muscles: ['Core', 'Back'] },
  // Burpee: full-body conditioning move: Core (plank/crunch phase) + Quads
  // (jump/squat phase) is the most representative 2-muscle credit available
  // in this taxonomy, rather than inventing a "full body" category.
  { test: n => /burpee/.test(n), muscles: ['Core', 'Quads'] },

  // ── Shoulders ──
  // "pull apart" (Band Pull Apart) added — a rear-delt isolation move,
  // classified the same as Face Pull/Reverse Fly.
  { test: n => /(rear delt|reverse fly|face pull|pull apart)/.test(n), muscles: ['Shoulders', 'Back'] },
  { test: n => /(shrug)/.test(n), muscles: ['Shoulders', 'Back'] },
  { test: n => /(lateral raise|side lateral|front raise|upright row)/.test(n), muscles: ['Shoulders'] },
  // "shoulders?\s*press" (not just singular "shoulder press") — "Shoulders
  // Press" is this app's own default/most-used exercise name (see
  // WorkoutTracker.jsx) and was previously falling through unmapped because
  // the plural form didn't match the old singular-only regex.
  {
    test: n => /(shoulders?\s*press|overhead press|arnold|military press|behind neck|clean and press|push press|behind.?the.?neck)/.test(n)
      // "Dumbbell Press (Seated)" has "seated" AFTER "press" ("Press
      // (Seated)"), so a single sequential "seated.*press" pattern misses
      // it — check both words appear anywhere, order-independent, instead.
      // A seated press with no chest/bench qualifier defaults to shoulder
      // press in standard gym naming.
      || (/seated/.test(n) && /press/.test(n)),
    muscles: ['Shoulders', 'Triceps'],
  },

  // ── Back (pulling compounds) ──
  { test: n => /(row|pulldown|pull.?up|chin.?up|lat |t.?bar|pendlay|pull through|v.?bar)/.test(n), muscles: ['Back', 'Biceps'] },

  // ── Chest (pressing compounds) ──
  // "incline.*press"/"decline.*press" catches named variants that don't
  // literally contain "bench" or "chest" (e.g. "Incline Dumbbell Press",
  // "Incline Barbell Press" — both real, selectable exercises in this app's
  // library) — checked here only after the curl/row rules above already
  // claimed any incline curl/row variant, so this can't misfire on those.
  // "smith machine" (for the unqualified "Press (Smith Machine)" entry) is a
  // judgment call — the name alone doesn't specify chest vs. shoulder, and a
  // flat smith-machine bench press is the more common gym-vernacular default
  // for an unqualified "Press (Smith Machine)" than a shoulder press.
  { test: n => /(bench|chest|fly|pec deck|push.?up|crossover|dip|around the world|floor press|incline.*press|decline.*press|smith machine)/.test(n), muscles: ['Chest', 'Triceps'] },
];

const memo = new Map();

// Returns an array of 1–2 canonical muscle group names for a given exercise
// name. Unrecognized/custom exercise names return [] (no muscle credited) —
// callers should treat that as "excluded from analytics", not an error.
export function getMuscleGroupsForExercise(exerciseName) {
  if (!exerciseName) return [];
  const key = exerciseName.trim().toLowerCase();
  if (memo.has(key)) return memo.get(key);

  const rule = RULES.find(r => r.test(key));
  const result = rule ? rule.muscles : [];
  memo.set(key, result);
  return result;
}
