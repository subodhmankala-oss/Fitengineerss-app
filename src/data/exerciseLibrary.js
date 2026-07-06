// ─── SHARED EXERCISE LIBRARY ───
// One source of truth for the exercise picker used on BOTH the client
// (WorkoutTracker) and the coach (TrainerDashboard) sides, so they always
// offer the same set of exercises. It's the union of the coach's long A-Z
// list and the client's curated library, de-duped and sorted A-Z, with a
// category + primary-muscle inferred for the modal's filter chips and
// muscle subtitle.

export const EXERCISE_CATEGORIES = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];

// Coach-side A-Z list (formerly LIVE_EXERCISE_LIST in TrainerDashboard).
const COACH_NAMES = [
  'Ab Wheel Rollout', 'Arnold Press', 'Around the World (Chest)', 'Assisted Pull-up', 'Assisted Dip',
  'Back Extension', 'Ball Slam', 'Band Pull Apart', 'Barbell Curl', 'Barbell Hip Thrust', 'Barbell Row',
  'Barbell Shrug', 'Barbell Squat', 'Behind Neck Press', 'Bench Press', 'Bent Over Dumbbell Row',
  'Bent Over Row (Barbell)', 'Bicep Curl (Cable)', 'Bicep Curl (Dumbbell)', 'Box Jump', 'Box Squat',
  'Bulgarian Split Squat', 'Burpee', 'Cable Crossover', 'Cable Crunch', 'Cable Curl', 'Cable Fly',
  'Cable Kickback', 'Cable Lateral Raise', 'Cable Overhead Triceps Extension', 'Cable Pull Through',
  'Cable Row (Seated)', 'Calf Raise (Machine)', 'Calf Raise (Standing)', 'Chest Dip', 'Chest Fly (Dumbbell)',
  'Chest Press (Machine)', 'Chin-up', 'Clean and Press', 'Close Grip Bench Press', 'Concentration Curl',
  'Crunch', 'Curtsy Lunge', 'Dead Bug', 'Deadlift', 'Deadlift (Sumo)', 'Decline Bench Press', 'Decline Crunch',
  'Deficit Push-up', 'Diamond Push-up', 'Dip', 'Dumbbell Curl', 'Dumbbell Fly', 'Dumbbell Lunge',
  'Dumbbell Press (Incline)', 'Dumbbell Press (Seated)', 'Dumbbell Row', 'Dumbbell Shrug', 'Dumbbell Squat',
  'EZ Bar Curl', 'EZ Bar Skullcrusher', 'Face Pull', 'Face Pull (Cable)', 'Farmer Walk', 'Floor Press',
  'Front Raise', 'Front Raise (Barbell)', 'Front Squat', 'Glute Bridge', 'Glute Kickback', 'Goblet Squat',
  'Good Morning', 'Hack Squat', 'Hammer Curl', 'Hanging Knee Raise', 'Hanging Leg Raise', 'High Cable Curl',
  'High Row (Machine)', 'Hip Abduction (Machine)', 'Hip Adduction (Machine)', 'Hip Thrust', 'Hyperextension',
  'Incline Barbell Press', 'Incline Dumbbell Curl', 'Incline Dumbbell Press', 'Incline Dumbbell Row',
  'Incline Push-up', 'Jump Squat', 'Jumping Jack', 'Kettlebell Swing', 'Kettlebell Goblet Squat',
  'Kneeling Cable Crunch', 'Lat Pulldown', 'Lat Pulldown (Close Grip)', 'Lat Pulldown (Wide Grip)',
  'Lateral Raise', 'Lateral Raise (Cable)', 'Lateral Raise (Machine)', 'Leg Curl (Lying)', 'Leg Curl (Seated)',
  'Leg Extension', 'Leg Press', 'Leg Press (Narrow Stance)', 'Low Cable Row', 'Lunge', 'Lying Triceps Extension',
  'Military Press', 'Mountain Climber', 'Neutral Grip Pull-up', 'Oblique Crunch', 'One Arm Cable Row',
  'One Arm Dumbbell Row', 'Overhead Press (Barbell)', 'Overhead Press (Dumbbell)', 'Overhead Triceps Extension',
  'Pec Deck Fly', 'Pendlay Row', 'Plank', 'Plank (Side)', 'Preacher Curl', 'Press (Smith Machine)', 'Pull-up',
  'Push-up', 'Push-up (Wide Grip)', 'Rack Pull', 'Rear Delt Fly', 'Rear Delt Fly (Cable)', 'Rear Delt Fly (Machine)',
  'Reverse Curl', 'Reverse Fly', 'Reverse Lunge', 'Romanian Deadlift', 'Romanian Deadlift (Dumbbell)', 'Russian Twist',
  'Seated Cable Row', 'Seated Calf Raise', 'Seated Dumbbell Curl', 'Seated Leg Curl', 'Seated Row (Machine)',
  'Shoulder Press (Barbell)', 'Shoulder Press (Dumbbell)', 'Shoulder Press (Machine)', 'Shrug', 'Shrug (Barbell)',
  'Shrug (Dumbbell)', 'Side Lateral Raise', 'Single Leg Deadlift', 'Single Leg Press', 'Skullcrusher',
  'Smith Machine Squat', 'Split Squat', 'Squat', 'Step-up', 'Stiff Leg Deadlift', 'Straight Bar Curl',
  'Sumo Deadlift', 'Superman', 'T-Bar Row', 'Triceps Dip', 'Triceps Extension (Cable)', 'Triceps Extension (Dumbbell)',
  'Triceps Kickback', 'Triceps Pushdown', 'Triceps Rope Pushdown', 'Upright Row (Barbell)', 'Upright Row (Cable)',
  'Upright Row (Dumbbell)', 'V Up', 'V-Bar Pulldown', 'Wide Grip Pull-up', 'Wrist Curl', 'Zercher Squat',
];

// Client-side curated names (from WorkoutTracker's presetExercises + library) that
// use a slightly different naming — kept so existing client selections still resolve.
const CLIENT_NAMES = [
  'Shoulders Press', 'Biceps Curls', 'One Arm Row', 'Lat Pull Down', 'Flat Bench Press', 'Incline Dumbbell Press',
  'Barbell Squat', 'Romanian Deadlift', 'Leg Extensions', 'Overhead Triceps Extension', 'Hammer Curls', 'Plank',
  'Hanging Leg Raises', 'Dumbbell Lateral Raises', 'Pull-ups', 'Assisted Dip', 'Assisted Pull-up', 'Back Extension',
  'Barbell Curl', 'Barbell Row', 'Barbell Shrug', 'Bench Press (Barbell)', 'Bench Press (Dumbbell)',
  'Bent Over Row (Barbell)', 'Bicep Curl (Dumbbell)', 'Bulgarian Split Squat', 'Cable Fly Crossovers',
  'Cable Kickback', 'Calf Raise', 'Chest Dip', 'Chest Fly (Dumbbell)', 'Chin Up', 'Close-Grip Bench Press',
  'Concentration Curl', 'Crunch', 'Deadlift (Barbell)', 'Decline Bench Press', 'Dumbbell Fly', 'Dumbbell Row',
  'Face Pull', 'Front Raise', 'Front Squat', 'Glute Bridge', 'Goblet Squat', 'Good Morning', 'Hack Squat',
  'Hammer Curl (Dumbbell)', 'Hanging Leg Raise', 'Hip Thrust', 'Incline Bench Press (Barbell)', 'Incline Dumbbell Curl',
  'Jump Squat', 'Kettlebell Swing', 'Lateral Raise (Dumbbell)', 'Leg Curl (Machine)', 'Leg Press', 'Lunge (Dumbbell)',
  'Mountain Climber', 'Overhead Press (Barbell)', 'Pec Deck Fly', 'Pendlay Row', 'Preacher Curl', 'Push Press',
  'Push Up', 'Rear Delt Fly', 'Reverse Curl', 'Russian Twist', 'Seated Cable Row', 'Seated Leg Curl',
  'Shoulder Press (Machine)', 'Side Plank', 'Single-Leg Romanian Deadlift', 'Sit Up', 'Skullcrusher',
  'Smith Machine Squat', 'Standing Calf Raise', 'Step Up', 'Sumo Deadlift', 'T-Bar Row', 'Triceps Dip',
  'Triceps Pushdown', 'Upright Row', 'Wall Sit', 'Wide-Grip Lat Pulldown', 'Wrist Curl', 'Zercher Squat',
  'Cable Crossover', 'Incline Dumbbell Press', 'Leg Extensions',
];

// Keyword classifier → one filter category. Order matters (specific first).
export function inferCategory(name) {
  const n = name.toLowerCase();
  if (/(crunch|plank|sit-?up|sit up|russian twist|leg raise|knee raise|mountain climber|dead bug|superman|oblique|v-?up|v up|ab wheel|hollow|hyperextension|back extension|dead ?bug)/.test(n)) return 'Core';
  if (/(curl|triceps|tricep|skullcrusher|pushdown|kickback|wrist|preacher|concentration|lying triceps)/.test(n)) return 'Arms';
  if (/(squat|lunge|deadlift|leg press|leg curl|leg extension|calf|glute|hip thrust|hip abduction|hip adduction|step-?up|good morning|bulgarian|box jump|split squat|hack|wall sit|kettlebell|curtsy|rack pull|single leg deadlift|stiff leg|farmer)/.test(n)) return 'Legs';
  if (/(shoulder|lateral raise|front raise|rear delt|reverse fly|upright row|arnold|military|overhead press|behind neck|face pull|shrug|clean and press|push press|band pull apart)/.test(n)) return 'Shoulders';
  if (/(row|pulldown|pull-?up|pull up|chin-?up|chin up|lat |t-bar|pendlay|pull through|v-bar)/.test(n)) return 'Back';
  if (/(bench|chest|fly|pec deck|push-?up|push up|dip|crossover|around the world|floor press|press)/.test(n)) return 'Chest';
  return 'Other';
}

// Short primary-muscle label for the row subtitle.
export function inferPrimary(name) {
  const n = name.toLowerCase();
  if (/(skullcrusher|pushdown|triceps|tricep|kickback|close grip|dip)/.test(n) && !/chest dip|^dip$/.test(n)) return 'Triceps';
  if (/(curl|preacher|concentration)/.test(n)) return 'Biceps';
  if (/wrist/.test(n)) return 'Forearms';
  if (/calf/.test(n)) return 'Calves';
  if (/(glute|hip thrust|glute bridge|kickback)/.test(n)) return 'Glutes';
  if (/(hamstring|romanian|stiff leg|leg curl|good morning|single leg deadlift)/.test(n)) return 'Hamstrings';
  if (/(squat|lunge|leg press|leg extension|step-?up|wall sit|split squat|hack)/.test(n)) return 'Quadriceps';
  if (/deadlift/.test(n)) return 'Posterior Chain';
  if (/(crunch|plank|sit-?up|russian twist|leg raise|knee raise|oblique|v-?up|ab wheel|superman|hyperextension|back extension|mountain climber|dead bug)/.test(n)) return 'Core / Abs';
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
  [...COACH_NAMES, ...CLIENT_NAMES].forEach(name => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, category: inferCategory(name), primary: inferPrimary(name) });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
})();
