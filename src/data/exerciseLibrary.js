// ─── SHARED EXERCISE LIBRARY ───
// One source of truth for the exercise picker used on BOTH the client
// (WorkoutTracker) and the coach (TrainerDashboard) sides, so they always
// offer the same set of exercises. It's the union of the coach's long A-Z
// list and the client's curated library, de-duped and sorted A-Z, with a
// category + primary-muscle inferred for the modal's filter chips and
// muscle subtitle.

export const EXERCISE_CATEGORIES = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Warm Up', 'Whole Body'];

// Cardio exercises are logged as distance + time instead of weight + reps
// (see isCardioExercise below) — the set shape and the picker/table UI both
// branch on this list.
//
// 'High Knees', 'High Knees Walk' and 'Foot Fires' are all tagged Cardio
// here (the picker's filter category), but none of them actually use the
// KM+TIME set shape below — 'High Knees' and 'Foot Fires' are bodyweight/
// reps (isBodyweightExercise) and 'High Knees Walk' is weight+meters
// (isLoadedCarryExercise), each excluded from isCardioExercise explicitly
// so their own classifiers win instead.
const CARDIO_NAMES = ['Running', 'Jogging', 'Cycling', 'Cross Trainer', 'Incline Walk', 'Walking', 'High Knees', 'High Knees Walk', 'Foot Fires'];

// Names that show under the picker's "Warm Up" filter chip (inferCategory
// below). Arm Circle + Leg Swing are auto-added to a fresh client workout
// log so a warm-up block is there by default, and contribute no weight/
// calories at all (see isWarmupExercise's own, narrower name list further
// down — NOT the same list as this one). Bird Dog and Cat Camel are real
// bodyweight core/mobility drills a client can log actual working sets of
// — findable under this same filter, but classified as Bodyweight (see
// isBodyweightExercise) rather than zero-contribution warm-up filler.
const WARMUP_NAMES = ['Arm Circle', 'Leg Swing', 'Bird Dog', 'Cat Camel'];

// Coach-side A-Z list (formerly LIVE_EXERCISE_LIST in TrainerDashboard).
const COACH_NAMES = [
  'Ab Wheel Rollout', 'Arnold Press', 'Around the World (Chest)', 'Assisted Pull-up', 'Assisted Dip',
  'Back Extension', 'Ball Slam', 'Band Pull Apart', 'Barbell Curl', 'Barbell Hip Thrust', 'Barbell Row',
  'Barbell Squat', 'Battle Rope', 'Beast Walk', 'Behind Neck Press', 'Bench Press', 'Bent Over Dumbbell Row',
  'Bent Over Row (Barbell)', 'Bicep Curl (Cable)', 'Bicep Curl (Dumbbell)', 'Box Jump', 'Box Squat',
  'Bulgarian Split Squat', 'Burpee', 'Cable Crossover', 'Cable Crunch', 'Cable Curl', 'Cable Fly', 'Chair Squat',
  'Cable Kickback', 'Cable Pull Through',
  'Calf Raise (Machine)', 'Chest Dip', 'Chest Fly (Dumbbell)',
  'Chest Press (Machine)', 'Chin-up', 'Clean and Press', 'Close Grip Bench Press', 'Concentration Curl',
  'Crunch', 'Curtsy Lunge', 'Dead Bug', 'Deadlift', 'Decline Bench Press', 'Decline Crunch',
  'Deficit Push-up', 'Diamond Push-up', 'Dip', 'Dumbbell Curl', 'Dumbbell Fly',
  'Dumbbell Press (Seated)', 'Dumbbell Row', 'Dumbbell Squat',
  'EZ Bar Curl', 'EZ Bar Skullcrusher', 'Face Pull', 'Face Pull (Cable)', 'Farmer Walk', 'Floor Press',
  'Front Raise', 'Front Raise (Barbell)', 'Front Squat', 'Glute Bridge', 'Glute Kickback', 'Goblet Squat',
  'Good Morning', 'Hack Squat', 'Hanging Knee Raise', 'High Cable Curl',
  'High Row (Machine)', 'Hip Abduction (Machine)', 'Hip Adduction (Machine)', 'Hip Thrust', 'Hyperextension',
  'Incline Barbell Press', 'Incline Dumbbell Curl', 'Incline Dumbbell Press', 'Incline Dumbbell Row',
  'Incline Push-up', 'Jump Squat', 'Jumping Jack', 'Kettlebell Swing', 'Kettlebell Goblet Squat',
  'Kneeling Cable Crunch', 'Lat Pulldown', 'Lat Pulldown (Close Grip)',
  'Lateral Raise', 'Lateral Raise (Cable)', 'Lateral Raise (Machine)', 'Leg Curl (Lying)',
  'Leg Press', 'Leg Press (Narrow Stance)', 'Leg Raise', 'Low Cable Row', 'Lunge', 'Lying Triceps Extension',
  'Military Press', 'Mountain Climber', 'Neutral Grip Pull-up', 'Oblique Crunch', 'One Arm Cable Row',
  'One Arm Dumbbell Row', 'Overhead Press (Barbell)', 'Overhead Press (Dumbbell)', 'Overhead Triceps Extension',
  'Pec Deck Fly', 'Pendlay Row', 'Plank', 'Preacher Curl', 'Press (Smith Machine)',
  'Push-up (Wide Grip)', 'Rack Pull', 'Rear Delt Fly', 'Rear Delt Fly (Cable)', 'Rear Delt Fly (Machine)',
  'Reverse Curl', 'Reverse Fly', 'Reverse Lunge', 'Romanian Deadlift', 'Romanian Deadlift (Dumbbell)', 'Russian Twist',
  'Seated Cable Row', 'Seated Calf Raise', 'Seated Dumbbell Curl', 'Seated Leg Curl', 'Seated Row (Machine)',
  'Shoulder Press (Barbell)', 'Shoulder Press (Dumbbell)', 'Shoulder Press (Machine)', 'Shrug',
  'Side Lateral Raise', 'Single Leg Deadlift', 'Single Leg Press', 'Skullcrusher',
  'Smith Machine Squat', 'Split Squat', 'Squat', 'Step-up', 'Steppers', 'Stiff Leg Deadlift', 'Straight Bar Curl',
  'Sumo Deadlift', 'Superman', 'T-Bar Row', 'Triceps Dip', 'Triceps Extension (Cable)', 'Triceps Extension (Dumbbell)',
  'Triceps Kickback', 'Triceps Pushdown', 'Triceps Rope Pushdown', 'Upright Row (Barbell)', 'Upright Row (Cable)',
  'Upright Row (Dumbbell)', 'V Up', 'V-Bar Pulldown', 'Wide Grip Pull-up', 'Wrist Curl', 'Zercher Squat',
];

// Client-side curated names (from WorkoutTracker's presetExercises + library) that
// use a slightly different naming — kept so existing client selections still resolve.
const CLIENT_NAMES = [
  'Shoulders Press', 'Biceps Curls', 'One Arm Row', 'Lat Pull Down', 'Flat Bench Press', 'Incline Dumbbell Press',
  'Barbell Squat', 'Romanian Deadlift', 'Overhead Triceps Extension', 'Plank',
  'Assisted Dip', 'Assisted Pull-up', 'Back Extension',
  'Barbell Curl', 'Barbell Row', 'Bench Press (Barbell)', 'Bench Press (Dumbbell)',
  'Bent Over Row (Barbell)', 'Bicep Curl (Dumbbell)', 'Bulgarian Split Squat', 'Cable Fly Crossovers',
  'Cable Kickback', 'Calf Raise', 'Chest Dip', 'Chest Fly (Dumbbell)',
  'Concentration Curl', 'Crunch', 'Deadlift (Barbell)', 'Decline Bench Press', 'Dumbbell Fly', 'Dumbbell Row',
  'Face Pull', 'Front Raise', 'Front Squat', 'Glute Bridge', 'Goblet Squat', 'Good Morning', 'Hack Squat',
  'Hip Thrust', 'Incline Bench Press (Barbell)', 'Incline Dumbbell Curl',
  'Jump Squat', 'Kettlebell Swing', 'Leg Curl (Machine)', 'Leg Press',
  'Mountain Climber', 'Overhead Press (Barbell)', 'Pec Deck Fly', 'Pendlay Row', 'Preacher Curl', 'Push Press',
  'Rear Delt Fly', 'Reverse Curl', 'Russian Twist', 'Seated Cable Row', 'Seated Leg Curl',
  'Shoulder Press (Machine)', 'Shoulder Taps', 'Side Hops', 'Side Plank', 'Single-Leg Romanian Deadlift', 'Sit Up', 'Skullcrusher',
  'Smith Machine Squat', 'Sumo Deadlift', 'T-Bar Row', 'Triceps Dip',
  'Triceps Pushdown', 'Upright Row', 'Wall Sit', 'Wrist Curl', 'Zercher Squat', 'One Leg Step-Ups',
];

// Keyword classifier → one filter category. Order matters (specific first).
export function inferCategory(name) {
  const n = name.toLowerCase();
  if (/(arm circle|leg swing|bird dog|cat camel)/.test(n)) return 'Warm Up';
  // 'air rowing' must be checked here, before the Back regex below — 'row'
  // is a bare substring there and 'rowing' contains it, so without this
  // Air Rowing silently fell through to Back (and showed "Back / Lats" as
  // its primary muscle via the identical bug in inferPrimary). Confirmed
  // 2026-08-25.
  if (/(running|jogging|\brun\b|\bjog\b|cycling|\bcycle\b|\bbike\b|treadmill|cross trainer|elliptical|incline walk|rowing machine|air rowing|\bswim|high knees|foot fires?)/.test(n) || (/\bwalk(ing)?\b/.test(n) && !/farmer|beast/.test(n))) return 'Cardio';
  if (/(crunch|plank|sit-?up|sit up|russian twist|leg raise|knee raise|mountain climber|dead bug|superman|oblique|v-?up|v up|ab wheel|hollow|hyperextension|back extension|dead ?bug|beast walk|battle rope|shoulder taps?)/.test(n)) return 'Core';
  if (/(curl|triceps|tricep|skullcrusher|pushdown|kickback|wrist|preacher|concentration|lying triceps)/.test(n)) return 'Arms';
  if (/(squat|lunge|deadlift|leg press|leg curl|leg extension|calf|glute|hip thrust|hip abduction|hip adduction|step-?up|steppers?\b|good morning|bulgarian|box jump|split squat|hack|wall sit|kettlebell|curtsy|rack pull|single leg deadlift|stiff leg|farmer|side hops?)/.test(n)) return 'Legs';
  if (/(shoulder|lateral raise|front raise|rear delt|reverse fly|upright row|arnold|military|overhead press|behind neck|face pull|shrug|clean and press|push press|band pull apart)/.test(n)) return 'Shoulders';
  if (/(row|pulldown|pull-?up|pull up|chin-?up|chin up|lat |t-bar|pendlay|pull through|v-bar)/.test(n)) return 'Back';
  if (/(bench|chest|fly|pec deck|push-?up|push up|dip|crossover|around the world|floor press|press)/.test(n)) return 'Chest';
  // Compound/full-body moves that don't isolate one region (Ball Slam,
  // Burpee, Jumping Jack) fall through every regex above to here — this
  // used to be an unlabeled 'Other' bucket with no filter chip in
  // EXERCISE_CATEGORIES, so these were only reachable under "All". Now a
  // real "Whole Body" chip.
  return 'Whole Body';
}

// Short primary-muscle label for the row subtitle.
export function inferPrimary(name) {
  const n = name.toLowerCase();
  // See the matching comment in inferCategory above — same 'air rowing'
  // must-check-before-Back reasoning applies here.
  if (/(running|jogging|\brun\b|\bjog\b|cycling|\bcycle\b|\bbike\b|treadmill|cross trainer|elliptical|incline walk|rowing machine|air rowing|\bswim|high knees|foot fires?)/.test(n) || (/\bwalk(ing)?\b/.test(n) && !/farmer|beast/.test(n))) return 'Cardio';
  if (/(skullcrusher|pushdown|triceps|tricep|kickback|close grip|dip)/.test(n) && !/chest dip|^dip$/.test(n)) return 'Triceps';
  if (/(curl|preacher|concentration)/.test(n)) return 'Biceps';
  if (/wrist/.test(n)) return 'Forearms';
  if (/calf/.test(n)) return 'Calves';
  if (/(glute|hip thrust|glute bridge|kickback)/.test(n)) return 'Glutes';
  if (/(hamstring|romanian|stiff leg|leg curl|good morning|single leg deadlift)/.test(n)) return 'Hamstrings';
  if (/(squat|lunge|leg press|leg extension|step-?up|steppers?\b|wall sit|split squat|hack)/.test(n)) return 'Quadriceps';
  if (/side hops?/.test(n)) return 'Calves';
  if (/deadlift/.test(n)) return 'Posterior Chain';
  if (/(crunch|plank|sit-?up|russian twist|leg raise|knee raise|oblique|v-?up|ab wheel|superman|hyperextension|back extension|mountain climber|dead bug|beast walk|battle rope|shoulder taps?)/.test(n)) return 'Core / Abs';
  if (/(rear delt|reverse fly|face pull)/.test(n)) return 'Rear Delts';
  if (/shrug/.test(n)) return 'Trapezius';
  if (/(lateral raise|side lateral)/.test(n)) return 'Side Delts';
  if (/(shoulder|overhead press|arnold|military|front raise|upright row|behind neck|clean and press|push press)/.test(n)) return 'Shoulders';
  if (/(row|pulldown|pull-?up|chin-?up|lat )/.test(n)) return 'Back / Lats';
  if (/(bench|chest|fly|pec deck|push-?up|crossover|dip|around the world|floor press)/.test(n)) return 'Chest';
  return 'Full Body';
}

// Merge, de-dupe (case-insensitive), classify, sort A-Z.
export const EXERCISE_LIBRARY = (() => {
  const seen = new Set();
  const out = [];
  [...COACH_NAMES, ...CLIENT_NAMES, ...CARDIO_NAMES, ...WARMUP_NAMES].forEach(name => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, category: inferCategory(name), primary: inferPrimary(name) });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
})();

// A cardio exercise is logged as distance (km) + time instead of weight +
// reps. Checked by category rather than a fixed name list so a custom
// exercise the client types in (e.g. "Swimming") is also recognized.
//
// 'High Knees' / 'High Knees Walk' / 'Foot Fires' are excluded here even
// though they're tagged Cardio category (see CARDIO_NAMES) — they use the
// bodyweight/reps and loaded-carry/meters set shapes respectively, not
// KM+TIME. 'Air Rowing' is excluded the same way (added 2026-08-25, fixing
// the category-only bug above) — it's now correctly tagged Cardio for the
// picker's filter chip, but it stays on the mm:ss-only isTimedExercise
// shape below, not KM+TIME, since there's no real distance being tracked.
export function isCardioExercise(name) {
  if (!name) return false;
  if (/high knees|foot fires?|air rowing/.test(name.toLowerCase())) return false;
  return inferCategory(name) === 'Cardio';
}

// Timed exercises (isometric holds like plank, wall sit) are logged with duration only,
// shown with a stopwatch UI instead of weight + reps fields.
//
// Air Rowing (a rowing-machine erg session with no resistance/distance
// tracked, unlike Rowing Machine's distance+time cardio shape above) is
// logged the same way — minutes:seconds only, no weight/reps.
//
// Battle Rope is logged here too — it's a bodyweight, mm:ss-timed move
// (no weight field, matching how it's actually trained: rounds of work by
// duration, not by rep count), so it reuses this same duration-only shape
// rather than the weight+reps Bodyweight/+Add Weight toggle below.
//
// Side Hops is logged the same duration-only way (mm:ss, no weight/reps) —
// it's trained as rounds of continuous hopping, not a rep count.
//
// Foot Fires (rapid alternating-leg "fast feet" drill, added 2026-08-25) is
// the one exercise that matches BOTH this and isBodyweightExercise below —
// unlike Battle Rope/Side Hops it DOES keep the Bodyweight/+Add Weight
// toggle, with the reps field replaced by this duration field instead of
// being dropped entirely (see the render logic in WorkoutTracker.jsx, which
// checks isBodyweightExercise(name) && isTimedExercise(name) as its own
// combined case ahead of the plain timed-only branch).
export function isTimedExercise(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return /\bplank\b|side plank|wall sit|hollow hold|dead hang|air rowing|battle rope|side hops?|foot fires?/.test(n);
}

// Loaded carries (Farmer Walk/Carry, suitcase carry, yoke walk, etc.) are
// logged as weight (kg) + distance (meters) instead of weight + reps — reps
// don't mean anything for a walk. Reuses the same {weight, reps} set shape
// as a normal strength exercise (reps holds the meters number); only the
// column labels differ, so no schema/data changes are needed.
export function isLoadedCarryExercise(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return /farmer|suitcase carry|yoke walk|waiter.?s walk|sandbag carry|loaded carry|high knees walk/.test(n);
}

// Bodyweight exercises (push-ups, mountain climbers, jumping jacks, burpees,
// high knees, foot fires, beast walk/bear crawl, leg raises, sit-ups,
// bodyweight squats) are usually logged with no added weight, but a client
// can wear a weighted vest or hold a plate, so the logger offers a
// Bodyweight/+Add Weight toggle instead of always requiring a KG number.
// Foot Fires (added 2026-08-25) is classified Cardio (see CARDIO_NAMES/
// inferCategory) and keeps this Bodyweight/+Add Weight toggle, but ALSO
// matches isTimedExercise above — it's logged by duration (mm:ss), not rep
// count, so the toggle's second field is a time field instead of the usual
// reps field. See the combined isBodyweightExercise+isTimedExercise render
// branch in WorkoutTracker.jsx. 'high knees' also matches inside 'High Knees
// Walk', but that name
// is caught by isLoadedCarryExercise first in the render priority order, so
// this overlap never actually shows the wrong UI for it. 'beast walk'
// contains 'walk' too, but
// inferCategory/inferPrimary explicitly exclude it from the Cardio walk
// match (see the 'beast' exclusion there), so it never competes with the
// KM+TIME cardio shape.
//
// 'squat' is matched as an exact full-name check (^squat$), not a substring
// like the others — a bare substring would also catch every loaded variant
// (Barbell Squat, Goblet Squat, Front Squat, Smith Machine Squat, Box
// Squat, Split Squat, Bulgarian Split Squat, Hack Squat, Dumbbell Squat,
// Jump Squat, Kettlebell Goblet Squat, Zercher Squat...), all of which are
// genuinely loaded exercises that should keep the normal weight+reps
// fields. Only the plain "Squat" preset (bodyweight air squat) and "Chair
// Squat" (a bodyweight sit-to-stand off a chair, occasionally loaded with a
// held plate/dumbbell) get the toggle.
//
// Bird Dog, Cat Camel and Shoulder Taps (added 2026-08-19) round out the
// bodyweight core/mobility set: they were previously either stuck under
// isWarmupExercise (Bird Dog/Cat Camel — zero weight field, zero calorie
// contribution, no matter how many real working reps were logged) or not
// recognized by any classifier at all (Shoulder Taps — fell through to a
// plain loaded exercise asking for a barbell-style KG number, which makes
// no sense for a plank-position bodyweight move). All three now default to
// Bodyweight like push-ups/mountain climbers, with the same +Add Weight
// escape hatch for a held plate/weighted vest.
//
// Glute Bridge (added 2026-08-19) is matched by its full two-word name only
// — not a bare 'glute' substring, which would also catch Glute Kickback —
// so its loaded cousins (Barbell Hip Thrust, Hip Thrust) are unaffected and
// stay always-loaded. A plain glute bridge is usually bodyweight but often
// loaded with a barbell across the hips, exactly the push-up/mountain-
// climber pattern this toggle exists for.
export function isBodyweightExercise(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  if (n === 'squat' || n === 'squats' || n === 'chair squat' || n === 'chair squats') return true;
  return /push[- ]?up|mountain climber|jumping jack|burpee|high knees|foot fires?|steppers?\b|beast walk|leg raise|sit-?up|sit up|bird dog|cat camel|shoulder taps?|glute bridge/.test(n);
}

// True zero-contribution warm-up reps (Arm Circle, Leg Swing) — no weight/KG
// field at all (not even the Bodyweight/+Add Weight toggle other bodyweight
// moves get), and no calorie contribution (see computeLiveCalories). These
// are the exercises auto-added to a fresh client workout log by default.
//
// Deliberately an explicit name list, NOT inferCategory(name) === 'Warm Up'
// as this used to read — Bird Dog and Cat Camel share that same picker
// filter category (real mobility drills worth finding under "Warm Up") but
// are actual bodyweight core work a client logs real sets of, not filler
// that's always worth exactly 0 calories. Deriving this from the category
// meant every rep of Bird Dog/Cat Camel was silently discarded from every
// calorie total no matter how it was logged. See isBodyweightExercise above
// for where they're classified now.
const ZERO_CONTRIBUTION_WARMUP_NAMES = ['Arm Circle', 'Leg Swing'];

export function isWarmupExercise(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return ZERO_CONTRIBUTION_WARMUP_NAMES.some((w) => w.toLowerCase() === n);
}
