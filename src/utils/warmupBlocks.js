import { inferCategory, isCardioExercise, isTimedExercise, isBodyweightExercise } from '../data/exerciseLibrary';

// ─── Weekly warm-up blocks for Workout Library programs ───
// Every library program opens with a ~5 min warm-up: 1 light cardio move +
// 2 activation moves, picked by the day's type (upper / lower / full body /
// core & conditioning) and Gym vs Home, and rotated weekly (Week 1 → 2 → 3
// → 1 …). The block stays the same all week, so a client gets familiar with
// it, and changes the next week.
//
// Every set is tagged as a warm-up set (set_type 'warmup'), so it shows "W",
// is skipped by the muscle heat map / weekly volume (muscleAnalytics
// isWorkingSet) and never feeds PREV or the progression hint for that
// exercise's real working sets (see prevSets). Calories still count what
// was really done — 4 minutes on a bike is real burn.
//
// Items: { name, sets, reps } for rep moves, { name, time: 'mm:ss' } for
// cardio and timed holds (time is the target; the stopwatch measures).

const C = (name, time) => ({ name, sets: 1, time });
const R = (name, reps, sets = 1) => ({ name, sets, reps });

export const WARMUP_BLOCKS = {
  upper: {
    gym: [
      [C('Cross Trainer', '04:00'), R('Arm Circle', 20), R('Band Pull Apart', 15)],
      [C('Air Rowing', '04:00'), R('External Rotation (Band)', 12), R('Incline Push-up', 10)],
      [C('Cycling', '04:00'), R('Scapular Pull-up', 8), R('Cable Y Raise', 12)],
    ],
    home: [
      [R('Jumping Jack', 30, 2), R('Arm Circle', 20), R('Knee Push Ups', 10)],
      [R('High Knees', 30, 2), R('Shoulder Taps', 20), R('Incline Push-up', 10)],
      [C('Walking', '04:00'), R('Arm Circle', 20), R('Superman', 10)],
    ],
  },
  lower: {
    gym: [
      [C('Cycling', '04:00'), R('Leg Swing', 10), R('Glute Bridge', 15)],
      [C('Incline Walk', '04:00'), R('Squat', 12), R('Lunge', 8)],
      [C('Treadmill Walk', '04:00'), R('Calf Raise', 15), R('Cat Camel', 10)],
    ],
    home: [
      [C('Walking', '04:00'), R('Leg Swing', 10), R('Glute Bridge', 15)],
      [R('High Knees', 30, 2), R('Chair Squat', 12), R('Lunge', 8)],
      [C('Jogging', '03:00'), R('Squat', 12), R('Calf Raise', 15)],
    ],
  },
  full: {
    gym: [
      [C('Treadmill Walk', '04:00'), R('Arm Circle', 20), R('Leg Swing', 10)],
      [C('Cross Trainer', '04:00'), R('Band Pull Apart', 15), R('Glute Bridge', 15)],
      [C('Air Rowing', '04:00'), R('Incline Push-up', 10), R('Squat', 12)],
    ],
    home: [
      [R('Jumping Jack', 30, 2), R('Arm Circle', 20), R('Leg Swing', 10)],
      [C('Walking', '04:00'), R('Knee Push Ups', 10), R('Glute Bridge', 15)],
      [R('High Knees', 30, 2), R('Shoulder Taps', 20), R('Chair Squat', 12)],
    ],
  },
  core: {
    gym: [
      [C('Cycling', '04:00'), R('Cat Camel', 10), R('Dead Bug', 10)],
      [C('Air Rowing', '04:00'), R('Bird Dog', 10), C('Plank', '00:30')],
      [C('Cross Trainer', '04:00'), R('Superman', 10), R('Beast Walk', 10)],
    ],
    home: [
      [R('Jumping Jack', 30, 2), R('Cat Camel', 10), R('Bird Dog', 10)],
      [R('High Knees', 30, 2), R('Dead Bug', 10), R('Superman', 10)],
      [C('Walking', '04:00'), C('Plank', '00:30'), R('Mountain Climber', 20)],
    ],
  },
};

// Stand-ins for a block move the day's program already contains (Home
// Beginner Full Body A has Squat + Glute Bridge; Core & Mobility has Bird
// Dog + Cat Camel …), so an exercise never appears twice in one session —
// the logger and saved logs key exercises by name. Tried in order; the
// first one not already in the program or the block wins.
const SUBSTITUTES = {
  gym: {
    cardio: [C('Cross Trainer', '04:00'), C('Cycling', '04:00'), C('Treadmill Walk', '04:00'), C('Air Rowing', '04:00')],
    upper: [R('Arm Circle', 20), R('Band Pull Apart', 15), R('Incline Push-up', 10), R('Shoulder Taps', 20)],
    lower: [R('Leg Swing', 10), R('Glute Bridge', 15), R('Chair Squat', 12), R('Calf Raise', 15)],
    core: [R('Cat Camel', 10), R('Bird Dog', 10), R('Dead Bug', 10), R('Superman', 10)],
  },
  home: {
    cardio: [R('Jumping Jack', 30, 2), R('High Knees', 30, 2), C('Walking', '04:00'), C('Jogging', '03:00')],
    upper: [R('Arm Circle', 20), R('Knee Push Ups', 10), R('Shoulder Taps', 20), R('Incline Push-up', 10)],
    lower: [R('Leg Swing', 10), R('Glute Bridge', 15), R('Chair Squat', 12), R('Calf Raise', 15)],
    core: [R('Cat Camel', 10), R('Bird Dog', 10), R('Dead Bug', 10), R('Superman', 10)],
  },
};

const UPPER_CATEGORIES = ['Chest', 'Back', 'Shoulders', 'Arms'];
const CORE_CATEGORIES = ['Core', 'Cardio', 'Whole Body', 'Warm Up'];

// Which slot of SUBSTITUTES a block move belongs to.
function slotOf(name) {
  const lower = name.toLowerCase();
  if (isCardioExercise(name) || /jumping jack|high knees|air rowing|jogging/.test(lower)) return 'cardio';
  const cat = inferCategory(name);
  if (cat === 'Legs' || lower === 'leg swing') return 'lower';
  if (UPPER_CATEGORIES.includes(cat) || lower === 'arm circle' || lower === 'knee push ups') return 'upper';
  return 'core';
}

// 'upper' | 'lower' | 'full' | 'core' for a program. Conditioning, cardio
// and mobility days are named as such (Intermediate Core & Conditioning,
// Home Advanced Conditioning, Home Beginner Core & Mobility …) and are
// mostly whole-body moves, so the name decides those. Everything else is
// read from its exercises: 60%+ of them in one area makes it that area's
// day, otherwise it's full body. "Beginner Lower & Core" is a lower day.
export function getWorkoutDayType(programName, exercises) {
  if (/conditioning|cardio|mobility/i.test(programName || '')) return 'core';
  const names = (exercises || []).map(ex => ex?.name).filter(Boolean);
  if (names.length === 0) return 'full';
  const share = (cats) => names.filter(n => cats.includes(inferCategory(n))).length / names.length;
  if (share(['Legs']) >= 0.6) return 'lower';
  if (share(UPPER_CATEGORIES) >= 0.6) return 'upper';
  if (share(CORE_CATEGORIES) >= 0.6) return 'core';
  return 'full';
}

// 0, 1 or 2 — which week of the 3-week warm-up rotation `date` is in.
// Weeks run Monday to Sunday on the local calendar, the same for every
// client, so the block only changes on a Monday and a client and their
// coach always see the same one.
const MONDAY_EPOCH_UTC = Date.UTC(1970, 0, 5);
export function getWarmupWeekIndex(date = new Date()) {
  const dayUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const week = Math.floor((dayUtc - MONDAY_EPOCH_UTC) / (7 * 24 * 60 * 60 * 1000));
  return ((week % 3) + 3) % 3;
}

// Logger sets for one block move, all tagged warm-up. Shapes match
// startPlan in WorkoutTracker: cardio = distance + time, timed holds =
// time, rep moves = reps. Bodyweight moves show "BW"; anything else (band
// moves) leaves the kg box empty — a warm-up never gets a made-up weight.
function warmupSets(item) {
  const tag = { isCompleted: false, isWarmup: true, setType: 'warmup' };
  return Array.from({ length: item.sets }, () => {
    if (isCardioExercise(item.name)) return { distanceKm: '', time: '', targetTime: item.time || '', ...tag };
    if (isTimedExercise(item.name) && isBodyweightExercise(item.name)) {
      return { time: '', targetTime: item.time || '', weight: '0', bodyweightMode: true, ...tag };
    }
    if (isTimedExercise(item.name)) return { time: '', targetTime: item.time || '', ...tag };
    if (isBodyweightExercise(item.name)) return { reps: String(item.reps), weight: '0', bodyweightMode: true, ...tag };
    return { reps: String(item.reps), weight: '', ...tag };
  });
}

// The warm-up exercises to put in front of a library program in the
// logger. `category` is 'gym' | 'home' (anything else is treated as gym).
export function buildWarmupExercises({ programName, exercises, category, date = new Date() }) {
  const place = category === 'home' ? 'home' : 'gym';
  const dayType = getWorkoutDayType(programName, exercises);
  const block = WARMUP_BLOCKS[dayType][place][getWarmupWeekIndex(date)];

  const inProgram = new Set((exercises || []).map(ex => (ex?.name || '').toLowerCase()));
  // A stand-in must not repeat the program or any other move of the block.
  const taken = new Set([...inProgram, ...block.map(item => item.name.toLowerCase())]);
  const picked = [];
  block.forEach(item => {
    let chosen = item;
    if (inProgram.has(item.name.toLowerCase())) {
      chosen = SUBSTITUTES[place][slotOf(item.name)].find(s => !taken.has(s.name.toLowerCase())) || null;
    }
    if (!chosen) return;
    taken.add(chosen.name.toLowerCase());
    picked.push(chosen);
  });

  return picked.map(item => ({ name: item.name, sets: warmupSets(item) }));
}
