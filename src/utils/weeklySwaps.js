import { getWorkoutDayType } from './warmupBlocks';

// ─── Weekly exercise swaps for Workout Library programs ───
// Each week a library program keeps most of its exercises (so strength
// progress stays comparable) and swaps a few for a close alternative that
// trains the same muscle, so it doesn't feel like the same session forever:
//
//   Beginner                 1 swap  — repetition is how they learn form
//   Intermediate             2 swaps
//   Advanced (Strength)      1 swap, last exercises only — the big lifts stay
//   Advanced (other)         2 swaps
//
// The first exercise (the main lift) never swaps, except on core /
// conditioning days, which have no main lift. Which exercises swap, and to
// what, rotates every Monday (same calendar week as the warm-up block), so
// every original exercise keeps coming back and the client and their coach
// always see the same plan.
//
// Alternatives are hand-picked, not inferred: "same main muscle" alone
// would allow Bench Press → Cable Fly. Home programs only ever get
// equipment-free alternatives. An exercise with no entry here never swaps.

const GYM = {
  'push-up': ['Push-up (Wide Grip)', 'Incline Push-up'],
  'dumbbell row': ['Seated Row (Machine)', 'One Arm Cable Row', 'Incline Dumbbell Row'],
  'plank': ['Side Plank', 'Dead Bug'],
  'bird dog': ['Superman', 'Dead Bug'],
  'side plank': ['Pallof Press', 'Plank'],
  'wall ball': ['Ball Slam', 'Kettlebell Swing'],
  'hip thrust': ['Barbell Hip Thrust', 'Cable Pull Through'],
  'step-up': ['Lunge', 'Reverse Lunge'],
  'standing calf raise': ['Seated Calf Raise', 'Calf Raise (Machine)'],
  'chest press (machine)': ['Bench Press (Dumbbell)', 'Incline Chest Press (Machine)'],
  'seated row (machine)': ['Dumbbell Row', 'Low Cable Row', 'Seated Cable Row'],
  'dead bug': ['Bird Dog', 'Plank', 'Heel Taps'],
  'glute bridge': ['Hip Thrust', 'Cable Pull Through'],
  'calf raise (standing)': ['Seated Calf Raise', 'Calf Raise (Machine)'],
  'crunch': ['Reverse Crunch', 'Bicycle Crunch', 'Cable Crunch'],
  'kettlebell swing': ['Cable Pull Through', 'Ball Slam'],
  'russian twist': ['Cable Woodchopper', 'Bicycle Crunch', 'Pallof Press'],
  'hanging knee raise': ['Leg Raise', 'Reverse Crunch'],
  'mountain climber': ['Burpee', 'Battle Rope'],
  'farmer walk': ['Battle Rope', 'Ball Slam'],
  'pull-up': ['Lat Pulldown', 'Chin-up', 'Assisted Pull-up'],
  'dip': ['Close Grip Bench Press', 'Assisted Dip'],
  'lateral raise': ['Lateral Raise (Cable)', 'Lateral Raise (Machine)'],
  'romanian deadlift': ['Romanian Deadlift (Dumbbell)', 'Good Morning', 'Stiff Leg Deadlift'],
  'leg press': ['Hack Squat', 'Smith Machine Squat', 'Leg Press (Narrow Stance)'],
  'leg curl (seated)': ['Leg Curl (Lying)', 'Nordic Hamstring Curl'],
  'lat pulldown': ['Lat Pulldown (Close Grip)', 'V-Bar Pulldown', 'Pull-up'],
  'seated cable row': ['Seated Row (Machine)', 'One Arm Cable Row', 'T-Bar Row'],
  'face pull': ['Rear Delt Fly', 'Reverse Fly', 'Rear Delt Fly (Machine)'],
  'hammer curl': ['Cross Body Hammer Curl', 'Reverse Curl', 'Dumbbell Curl'],
  'overhead press (dumbbell)': ['Arnold Press', 'Shoulder Press (Machine)', 'Dumbbell Press (Seated)'],
  'incline dumbbell press': ['Incline Barbell Press', 'Incline Chest Press (Machine)', 'Landmine Press'],
  'cable fly': ['Pec Deck Fly', 'Dumbbell Fly', 'Incline Cable Fly'],
  'triceps pushdown': ['Triceps Rope Pushdown', 'Overhead Triceps Extension', 'Skullcrusher'],
  'hack squat': ['Leg Press', 'Smith Machine Squat'],
  'seated calf raise': ['Calf Raise (Machine)', 'Standing Calf Raise'],
  'close grip bench press': ['Dip', 'EZ Bar Skullcrusher'],
  'cable overhead triceps extension': ['Overhead Triceps Extension', 'Skullcrusher', 'Triceps Rope Pushdown'],
  'barbell shrug': ['Shrug', 'Kelso Shrug'],
  'face pull (cable)': ['Rear Delt Fly (Cable)', 'Reverse Fly'],
  'front squat': ['Goblet Squat', 'Zercher Squat'],
  'push-up (wide grip)': ['Deficit Push-up', 'Decline Push-up'],
  'box squat': ['Jump Squat', 'Bulgarian Split Squat'],
  'v up': ['Hanging Knee Raise', 'Ab Wheel Rollout'],
  'box jump': ['Jump Squat', 'Side Hops'],
  'burpee': ['Mountain Climber', 'Battle Rope'],
  'sumo deadlift': ['Romanian Deadlift', 'Good Morning'],
  'plank (side)': ['Pallof Press', 'Russian Twist'],
  'one arm dumbbell row': ['Incline Dumbbell Row', 'One Arm Cable Row'],
  'cable row (seated)': ['Seated Row (Machine)', 'T-Bar Row'],
  'rear delt fly (cable)': ['Rear Delt Fly (Machine)', 'Face Pull'],
  'ez bar curl': ['Barbell Curl', 'Preacher Curl', 'Bayesian Cable Curl'],
  'chest dip': ['Assisted Dip', 'Decline Bench Press'],
  'cable crossover': ['Pec Deck Fly', 'High to Low Cable Fly'],
  'lateral raise (cable)': ['Lateral Raise', 'Lateral Raise (Machine)'],
  'triceps rope pushdown': ['Triceps Pushdown', 'Overhead Triceps Extension'],
};

const HOME = {
  'push up': ['Incline Push-up', 'Push-up (Wide Grip)'],
  'glute bridge': ['Step-up', 'Lunge'],
  'plank': ['Side Plank', 'Dead Bug'],
  'incline push-up': ['Push Up', 'Knee Push Ups'],
  'superman': ['Bird Dog'],
  'dead bug': ['Bird Dog', 'Heel Taps', 'Flutter Kicks'],
  'hundred': ['Flutter Kicks', 'Heel Taps'],
  'bird dog': ['Dead Bug', 'Superman'],
  'cat camel': ['Superman', 'Dead Bug'],
  'crunch': ['Reverse Crunch', 'Bicycle Crunch', 'Heel Taps'],
  'wall sit': ['Squat', 'Chair Squat'],
  'diamond push-up': ['Push-up (Wide Grip)', 'Decline Push-up'],
  'explosive / plyometric push-up': ['Decline Push-up', 'Deficit Push-up'],
  'bulgarian split squat': ['Reverse Lunge', 'Cossack Squat', 'Split Squat'],
  'reverse lunge': ['Curtsy Lunge', 'Lunge', 'Step-up'],
  'russian twist': ['Bicycle Crunch', 'Heel Taps', 'Windshield Wipers'],
  'v up': ['Leg Raise', 'Flutter Kicks'],
  'sit up': ['Crunch', 'Reverse Crunch'],
  'mountain climber': ['High Knees', 'Shoulder Taps'],
  'burpee': ['Jump Squat', 'Jumping Jack'],
  'high knees': ['Side Hops', 'Jumping Jack'],
  'jumping jack': ['Side Hops', 'High Knees'],
  'foot fires': ['Side Hops', 'High Knees'],
  'deficit push-up': ['Decline Push-up', 'Diamond Push-up'],
  'push-up (wide grip)': ['Decline Push-up', 'Incline Push-up'],
  'curtsy lunge': ['Reverse Lunge', 'Cossack Squat'],
  'single leg deadlift': ['Nordic Hamstring Curl', 'Glute Bridge'],
};

export const SWAP_ALTERNATIVES = { gym: GYM, home: HOME };

// How many exercises swap each week, and from which position on.
function swapRule(programName, level, dayType) {
  const firstSwappable = dayType === 'core' ? 0 : 1;
  if (level === 'beginner') return { count: 1, firstSwappable };
  if (level === 'advanced' && /strength/i.test(programName || '')) return { count: 1, firstSwappable: 3 };
  if (level === 'intermediate' || level === 'advanced') return { count: 2, firstSwappable };
  return { count: 0, firstSwappable };
}

// Weeks since a fixed Monday — keeps counting (unlike the 3-week warm-up
// index), so the swaps cycle through every exercise and alternative.
const MONDAY_EPOCH_UTC = Date.UTC(1970, 0, 5);
function weekNumber(date) {
  const dayUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((dayUtc - MONDAY_EPOCH_UTC) / (7 * 24 * 60 * 60 * 1000));
}

// The program's exercises with this week's swaps applied. A swapped entry
// keeps the original's sets/reps and gains `swappedFrom` (the original
// name), which the logger shows as "New this week · instead of …".
// `level` is the library level; anything else (a non-library template)
// returns the exercises unchanged.
export function applyWeeklySwaps({ programName, exercises, level, category, date = new Date() }) {
  const list = Array.isArray(exercises) ? exercises : [];
  // Hyrox programs train the race's own stations — swapping Wall Ball for
  // Ball Slam would miss the point — so they never swap.
  if (category === 'hyrox') return list;
  const dayType = getWorkoutDayType(programName, list);
  const { count, firstSwappable } = swapRule(programName, level, dayType);
  if (count === 0) return list;

  const alternatives = SWAP_ALTERNATIVES[category === 'home' ? 'home' : 'gym'];
  const inProgram = new Set(list.map(ex => (ex?.name || '').toLowerCase()));
  const eligible = list
    .map((ex, i) => i)
    .filter(i => i >= firstSwappable && alternatives[(list[i]?.name || '').toLowerCase()]);
  if (eligible.length === 0) return list;

  const week = weekNumber(date);
  const positions = new Set();
  for (let j = 0; j < Math.min(count, eligible.length); j++) {
    positions.add(eligible[(week * count + j) % eligible.length]);
  }

  const used = new Set(inProgram);
  return list.map((ex, i) => {
    if (!positions.has(i)) return ex;
    const options = alternatives[ex.name.toLowerCase()];
    // Rotate through the alternatives too, skipping any the session
    // already has.
    const start = Math.floor(week / eligible.length);
    for (let k = 0; k < options.length; k++) {
      const pick = options[(start + k) % options.length];
      if (used.has(pick.toLowerCase())) continue;
      used.add(pick.toLowerCase());
      // The original's library id names the original, not the swap-in.
      const { exerciseId: _originalId, ...rest } = ex;
      return { ...rest, name: pick, swappedFrom: ex.name };
    }
    return ex;
  });
}
