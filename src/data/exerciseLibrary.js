// ─── SHARED EXERCISE LIBRARY ───
// One source of truth for the exercise picker used on BOTH the client
// (WorkoutTracker) and the coach (TrainerDashboard) sides, so they always
// offer the same set of exercises. It's the union of the coach's long A-Z
// list and the client's curated library, de-duped and sorted A-Z, with a
// category + primary-muscle inferred for the modal's filter chips and
// muscle subtitle.

export const EXERCISE_CATEGORIES = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Warm Up'];

// Cardio exercises are logged as distance + time instead of weight + reps
// (see isCardioExercise below) — the set shape and the picker/table UI both
// branch on this list.
//
// 'High Knees' and 'High Knees Walk' are both tagged Cardio here (the
// picker's filter category), but neither actually uses the KM+TIME set
// shape below — 'High Knees' is bodyweight/reps (isBodyweightExercise) and
// 'High Knees Walk' is weight+meters (isLoadedCarryExercise), each excluded
// from isCardioExercise explicitly so their own classifiers win instead.
const CARDIO_NAMES = ['Running', 'Jogging', 'Cycling', 'Cross Trainer', 'Incline Walk', 'Walking', 'High Knees', 'High Knees Walk'];

// Dynamic warm-up moves — reps only, no weight, no calorie contribution (see
// isWarmupExercise below). Arm Circle + Leg Swing are auto-added to a fresh
// client workout log so a warm-up block is there by default. Bird Dog and
// Cat Camel are mobility drills logged the same reps-only way — no kg field
// at all, since they're never loaded with weight.
const WARMUP_NAMES = ['Arm Circle', 'Leg Swing', 'Bird Dog', 'Cat Camel'];

// Coach-side A-Z list (formerly LIVE_EXERCISE_LIST in TrainerDashboard).
const COACH_NAMES = [
  'Ab Wheel Rollout', 'Alternate Leg Raise', 'Arnold Press', 'Around the World (Chest)', 'Assisted Pull-up', 'Assisted Dip',
  'Back Extension', 'Ball Slam', 'Band Pull Apart', 'Barbell Curl', 'Barbell Hip Thrust', 'Barbell Row',
  'Barbell Shrug', 'Barbell Squat', 'Battle Rope', 'Beast Walk', 'Behind Neck Press', 'Bench Press', 'Bent Over Dumbbell Row',
  'Bent Over Row (Barbell)', 'Bicep Curl (Cable)', 'Bicep Curl (Dumbbell)', 'Box Jump', 'Box Squat',
  'Bulgarian Split Squat', 'Burpee', 'Cable Crossover', 'Cable Crunch', 'Cable Curl', 'Cable Fly', 'Chair Squat',
  'Cable Kickback', 'Cable Overhead Triceps Extension', 'Cable Pull Through',
  'Calf Raise (Machine)', 'Calf Raise (Standing)', 'Chest Dip', 'Chest Fly (Dumbbell)',
  'Chest Press (Machine)', 'Chin-up', 'Clean and Press', 'Close Grip Bench Press', 'Concentration Curl',
  'Crunch', 'Curtsy Lunge', 'Dead Bug', 'Deadlift', 'Decline Bench Press', 'Decline Crunch',
  'Deficit Push-up', 'Diamond Push-up', 'Dip', 'Dumbbell Curl', 'Dumbbell Fly', 'Dumbbell Lunge',
  'Dumbbell Press (Seated)', 'Dumbbell Row', 'Dumbbell Shrug', 'Dumbbell Squat',
  'EZ Bar Curl', 'EZ Bar Skullcrusher', 'Face Pull', 'Face Pull (Cable)', 'Farmer Walk', 'Floor Press',
  'Front Raise', 'Front Raise (Barbell)', 'Front Squat', 'Glute Bridge', 'Glute Kickback', 'Goblet Squat',
  'Good Morning', 'Hack Squat', 'Hanging Knee Raise', 'High Cable Curl',
  'High Row (Machine)', 'Hip Abduction (Machine)', 'Hip Adduction (Machine)', 'Hip Thrust', 'Hyperextension',
  'Incline Barbell Press', 'Incline Dumbbell Curl', 'Incline Dumbbell Press', 'Incline Dumbbell Row',
  'Incline Push-up', 'Jump Squat', 'Jumping Jack', 'Kettlebell Swing', 'Kettlebell Goblet Squat',
  'Kneeling Cable Crunch', 'Lat Pulldown', 'Lat Pulldown (Close Grip)', 'Lat Pulldown (Wide Grip)',
  'Lateral Raise', 'Lateral Raise (Cable)', 'Lateral Raise (Machine)', 'Leg Curl (Lying)',
  'Leg Press', 'Leg Press (Narrow Stance)', 'Leg Raise', 'Low Cable Row', 'Lunge', 'Lying Triceps Extension',
  'Military Press', 'Mountain Climber', 'Neutral Grip Pull-up', 'Oblique Crunch', 'One Arm Cable Row',
  'One Arm Dumbbell Row', 'Overhead Press (Barbell)', 'Overhead Press (Dumbbell)', 'Overhead Triceps Extension',
  'Pec Deck Fly', 'Pendlay Row', 'Plank', 'Preacher Curl', 'Press (Smith Machine)',
  'Push-up', 'Push-up (Wide Grip)', 'Rack Pull', 'Rear Delt Fly', 'Rear Delt Fly (Cable)', 'Rear Delt Fly (Machine)',
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
  'Barbell Curl', 'Barbell Row', 'Barbell Shrug', 'Bench Press (Barbell)', 'Bench Press (Dumbbell)',
  'Bent Over Row (Barbell)', 'Bicep Curl (Dumbbell)', 'Bulgarian Split Squat', 'Cable Fly Crossovers',
  'Cable Kickback', 'Calf Raise', 'Chest Dip', 'Chest Fly (Dumbbell)',
  'Concentration Curl', 'Crunch', 'Deadlift (Barbell)', 'Decline Bench Press', 'Dumbbell Fly', 'Dumbbell Row',
  'Face Pull', 'Front Raise', 'Front Squat', 'Glute Bridge', 'Goblet Squat', 'Good Morning', 'Hack Squat',
  'Hip Thrust', 'Incline Bench Press (Barbell)', 'Incline Dumbbell Curl',
  'Jump Squat', 'Kettlebell Swing', 'Leg Curl (Machine)', 'Leg Press',
  'Mountain Climber', 'Overhead Press (Barbell)', 'Pec Deck Fly', 'Pendlay Row', 'Preacher Curl', 'Push Press',
  'Rear Delt Fly', 'Reverse Curl', 'Russian Twist', 'Seated Cable Row', 'Seated Leg Curl',
  'Shoulder Press (Machine)', 'Side Hops', 'Side Plank', 'Single-Leg Romanian Deadlift', 'Sit Up', 'Skullcrusher',
  'Smith Machine Squat', 'Sumo Deadlift', 'T-Bar Row', 'Triceps Dip',
  'Triceps Pushdown', 'Upright Row', 'Wall Sit', 'Wrist Curl', 'Zercher Squat', 'One Leg Step-Ups',
];

// Keyword classifier → one filter category. Order matters (specific first).
export function inferCategory(name) {
  const n = name.toLowerCase();
  if (/(arm circle|leg swing|bird dog|cat camel)/.test(n)) return 'Warm Up';
  if (/(running|jogging|\brun\b|\bjog\b|cycling|\bcycle\b|\bbike\b|treadmill|cross trainer|elliptical|incline walk|rowing machine|\bswim|high knees)/.test(n) || (/\bwalk(ing)?\b/.test(n) && !/farmer|beast/.test(n))) return 'Cardio';
  if (/(crunch|plank|sit-?up|sit up|russian twist|leg raise|knee raise|mountain climber|dead bug|superman|oblique|v-?up|v up|ab wheel|hollow|hyperextension|back extension|dead ?bug|beast walk|battle rope)/.test(n)) return 'Core';
  if (/(curl|triceps|tricep|skullcrusher|pushdown|kickback|wrist|preacher|concentration|lying triceps)/.test(n)) return 'Arms';
  if (/(squat|lunge|deadlift|leg press|leg curl|leg extension|calf|glute|hip thrust|hip abduction|hip adduction|step-?up|steppers?\b|good morning|bulgarian|box jump|split squat|hack|wall sit|kettlebell|curtsy|rack pull|single leg deadlift|stiff leg|farmer|side hops?)/.test(n)) return 'Legs';
  if (/(shoulder|lateral raise|front raise|rear delt|reverse fly|upright row|arnold|military|overhead press|behind neck|face pull|shrug|clean and press|push press|band pull apart)/.test(n)) return 'Shoulders';
  if (/(row|pulldown|pull-?up|pull up|chin-?up|chin up|lat |t-bar|pendlay|pull through|v-bar)/.test(n)) return 'Back';
  if (/(bench|chest|fly|pec deck|push-?up|push up|dip|crossover|around the world|floor press|press)/.test(n)) return 'Chest';
  return 'Other';
}

// Short primary-muscle label for the row subtitle.
export function inferPrimary(name) {
  const n = name.toLowerCase();
  if (/(running|jogging|\brun\b|\bjog\b|cycling|\bcycle\b|\bbike\b|treadmill|cross trainer|elliptical|incline walk|rowing machine|\bswim|high knees)/.test(n) || (/\bwalk(ing)?\b/.test(n) && !/farmer|beast/.test(n))) return 'Cardio';
  if (/(skullcrusher|pushdown|triceps|tricep|kickback|close grip|dip)/.test(n) && !/chest dip|^dip$/.test(n)) return 'Triceps';
  if (/(curl|preacher|concentration)/.test(n)) return 'Biceps';
  if (/wrist/.test(n)) return 'Forearms';
  if (/calf/.test(n)) return 'Calves';
  if (/(glute|hip thrust|glute bridge|kickback)/.test(n)) return 'Glutes';
  if (/(hamstring|romanian|stiff leg|leg curl|good morning|single leg deadlift)/.test(n)) return 'Hamstrings';
  if (/(squat|lunge|leg press|leg extension|step-?up|steppers?\b|wall sit|split squat|hack)/.test(n)) return 'Quadriceps';
  if (/side hops?/.test(n)) return 'Calves';
  if (/deadlift/.test(n)) return 'Posterior Chain';
  if (/(crunch|plank|sit-?up|russian twist|leg raise|knee raise|oblique|v-?up|ab wheel|superman|hyperextension|back extension|mountain climber|dead bug|beast walk|battle rope)/.test(n)) return 'Core / Abs';
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
// 'High Knees' / 'High Knees Walk' are excluded here even though they're
// tagged Cardio category (see CARDIO_NAMES) — they use the bodyweight/reps
// and loaded-carry/meters set shapes respectively, not KM+TIME.
export function isCardioExercise(name) {
  if (!name) return false;
  if (/high knees/.test(name.toLowerCase())) return false;
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
export function isTimedExercise(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return /\bplank\b|side plank|wall sit|hollow hold|dead hang|air rowing|battle rope|side hops?/.test(n);
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
// high knees, beast walk/bear crawl, leg raises, sit-ups, bodyweight squats)
// are usually logged with no added weight, but a client can wear a weighted
// vest or hold a plate, so the logger offers a Bodyweight/+Add Weight toggle
// instead of always requiring a KG number. 'high knees' also matches inside
// 'High Knees Walk', but that name is caught by isLoadedCarryExercise first
// in the render priority order, so this overlap never actually shows the
// wrong UI for it. 'beast walk' contains 'walk' too, but
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
export function isBodyweightExercise(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  if (n === 'squat' || n === 'squats' || n === 'chair squat' || n === 'chair squats') return true;
  return /push[- ]?up|mountain climber|jumping jack|burpee|high knees|steppers?\b|beast walk|leg raise|sit-?up|sit up/.test(n);
}

// Warm-up moves (Arm Circle, Leg Swing) are reps-only — no weight/KG field
// at all (not even the Bodyweight/+Add Weight toggle other bodyweight moves
// get), and no calorie contribution (see computeLiveCalories). These are the
// exercises auto-added to a fresh client workout log by default.
export function isWarmupExercise(name) {
  if (!name) return false;
  return inferCategory(name) === 'Warm Up';
}
