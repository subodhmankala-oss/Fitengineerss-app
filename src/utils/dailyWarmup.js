import { isCardioExercise, isTimedExercise, isBodyweightExercise } from '../data/exerciseLibrary';
import { getWorkoutDayType, isWarmupCardExercise } from './warmupBlocks';

// ─── Daily warm-up for coaching clients ───
// A coach plan opens with a ~5 min warm-up that changes every day: 1 light
// cardio move + 2 activation moves picked for the day's type (upper /
// lower / full body / core, read from the plan's exercises). Each day type
// has 7 warm-ups, one per weekday, so two leg days in the same week never
// get the same one; the whole week shifts by 3 the next week, so Monday
// isn't the same Monday after Monday. The pick depends only on the date and
// the plan, so the client's logger and the coach's Live Log show the same
// warm-up.
//
// The first warm-up move carries `warmupWhy`: one line under the Warm-up
// card saying why these moves fit today (see WarmupMoveRow).
//
// Library programs keep their weekly block (utils/warmupBlocks).

const C = (name, time) => ({ name, sets: 1, time });
const R = (name, reps, sets = 1) => ({ name, sets, reps });

const CARDIO = [C('Cross Trainer', '04:00'), C('Cycling', '04:00'), C('Incline Walk', '04:00')];

// Two activation moves per day of the week (Mon … Sun), per day type.
const PAIRS = {
  upper: [
    [R('Band Pull Apart', 15), R('Incline Push-up', 10)],
    [R('Scapular Pull-up', 8), R('Arm Circle', 20)],
    [R('External Rotation (Band)', 12), R('Arm Circle', 20)],
    [R('Face Pull', 15), R('Shoulder Taps', 20)],
    [R('Cable Y Raise', 12), R('Incline Push-up', 10)],
    [R('Superman', 10), R('Band Pull Apart', 15)],
    [R('Cat Camel', 10), R('Arm Circle', 20)],
  ],
  lower: [
    [R('Leg Swing', 10), R('Glute Bridge', 15)],
    [R('Squat', 12), R('Lunge', 8)],
    [R('Lateral Band Walk', 12), R('Calf Raise', 15)],
    [R('Good Morning', 10), R('Cat Camel', 10)],
    [R('Monster Walk', 10), R('Glute Bridge', 15)],
    [R('Clamshell', 12), R('Step-up', 8)],
    [R('Chair Squat', 12), R('Leg Swing', 10)],
  ],
  full: [
    [R('Arm Circle', 20), R('Leg Swing', 10)],
    [R('Band Pull Apart', 15), R('Glute Bridge', 15)],
    [R('Incline Push-up', 10), R('Squat', 12)],
    [R('Cat Camel', 10), R('Lunge', 8)],
    [R('Face Pull', 15), R('Calf Raise', 15)],
    [R('Bird Dog', 10), R('Leg Swing', 10)],
    [R('Shoulder Taps', 20), R('Clamshell', 12)],
  ],
  core: [
    [R('Dead Bug', 10), R('Cat Camel', 10)],
    [R('Bird Dog', 10), C('Plank', '00:30')],
    [R('Superman', 10), R('Beast Walk', 10)],
    [C('Side Plank', '00:20'), R('Dead Bug', 10)],
    [C('Hollow Hold', '00:20'), R('Cat Camel', 10)],
    [R('Mountain Climber', 20), R('Bird Dog', 10)],
    [R('Cat Camel', 10), R('Superman', 10)],
  ],
};

// Stand-ins when a warm-up move is already in today's plan — an exercise
// never appears twice in one session (logs key exercises by name).
const SPARES = {
  upper: [R('Arm Circle', 20), R('Shoulder Taps', 20), R('Cat Camel', 10), R('Band Pull Apart', 15)],
  lower: [R('Leg Swing', 10), R('Glute Bridge', 15), R('Calf Raise', 15), R('Clamshell', 12)],
  full: [R('Arm Circle', 20), R('Leg Swing', 10), R('Cat Camel', 10), R('Calf Raise', 15)],
  core: [R('Cat Camel', 10), R('Bird Dog', 10), R('Dead Bug', 10), R('Superman', 10)],
};

const DAY_PHRASE = {
  upper: 'Upper body today.',
  lower: 'Leg day.',
  full: 'Full body today.',
  core: 'Core day.',
};

// Why each activation move is there, in plain words.
const MOVE_WHY = {
  'band pull apart': 'Pull-aparts wake up your upper back, so your shoulders stay steady when you push.',
  'scapular pull-up': 'Scap pull-ups teach your shoulder blades to move first, so pulling works your back, not just your arms.',
  'external rotation (band)': 'Band rotations warm the small rotator cuff muscles that get hurt most when pressing.',
  'face pull': 'Face pulls open the front of your shoulders after hours hunched over a desk or phone.',
  'cable y raise': 'Y raises switch on your lower traps, which hold your shoulders in place overhead.',
  'superman': 'Supermans warm your whole back, from neck to hips, before you load it.',
  'cat camel': 'Cat camels loosen your spine, so your hips and shoulders have room to move.',
  'arm circle': 'Arm circles and leg swings take every big joint through its full range before you add weight.',
  'leg swing': 'Leg swings open your hips, so squats and lunges go deeper without strain.',
  'squat': 'Bodyweight squats and lunges rehearse today’s moves before any weight goes on.',
  'lateral band walk': 'Band walks wake up the sides of your hips, which stop your knees caving in.',
  'good morning': 'Good mornings warm your hamstrings and lower back for hinges and deadlifts.',
  'monster walk': 'Monster walks switch on your glutes, so they do the work instead of your lower back.',
  'clamshell': 'Clamshells wake up the small hip muscles that keep your knees in line.',
  'chair squat': 'Chair squats grease the squat pattern gently before the heavy sets.',
  'incline push-up': 'Easy push-ups warm your chest and shoulders in the same line you’ll press today.',
  'bird dog': 'Bird dogs teach your trunk to stay still while your arms and legs move.',
  'dead bug': 'Dead bugs teach your trunk to stay still while your arms and legs move — every core move needs that.',
  'side plank': 'Side planks wake up the sides of your waist, which protect your lower back.',
  'hollow hold': 'Hollow holds switch on your deep front core before the harder work.',
  'mountain climber': 'Mountain climbers raise your heart rate and warm your core at the same time.',
  'shoulder taps': 'Shoulder taps warm your shoulders and core together.',
};

// Monday = 0 … Sunday = 6, plus 3 per week since an epoch Monday, mod 7.
const MONDAY_EPOCH_UTC = Date.UTC(1970, 0, 5);
const DAY_MS = 24 * 60 * 60 * 1000;
export function getDailyWarmupIndex(date = new Date()) {
  const days = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - MONDAY_EPOCH_UTC) / DAY_MS);
  const weekday = ((days % 7) + 7) % 7;
  const week = Math.floor(days / 7);
  return (((weekday + 3 * week) % 7) + 7) % 7;
}

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

// The warm-up moves for today's coach plan, first one carrying `warmupWhy`.
export function buildDailyWarmup({ planName, exercises, date = new Date() } = {}) {
  const dayType = getWorkoutDayType(planName, exercises);
  const idx = getDailyWarmupIndex(date);
  const block = [CARDIO[idx % CARDIO.length], ...PAIRS[dayType][idx]];

  const inPlan = new Set((exercises || []).map(ex => (ex?.name || '').toLowerCase()));
  const taken = new Set([...inPlan, ...block.map(i => i.name.toLowerCase())]);
  const picked = [];
  block.forEach(item => {
    let chosen = item;
    if (inPlan.has(item.name.toLowerCase())) {
      const pool = isCardioExercise(item.name) ? CARDIO : SPARES[dayType];
      chosen = pool.find(s => !taken.has(s.name.toLowerCase())) || null;
    }
    if (!chosen) return;
    taken.add(chosen.name.toLowerCase());
    picked.push(chosen);
  });

  const reason = picked.map(i => MOVE_WHY[i.name.toLowerCase()]).find(Boolean);
  const why = reason ? `${DAY_PHRASE[dayType]} ${reason}` : null;
  return picked.map((item, i) => ({
    name: item.name,
    ...(i === 0 && why ? { warmupWhy: why } : {}),
    sets: warmupSets(item),
  }));
}

// A plan's exercises without its own warm-up moves (a plan rebuilt from a
// past session still carries that day's warm-up), so today's daily warm-up
// replaces them instead of stacking a second Warm-up card on top.
export function withoutWarmups(exercises) {
  return (exercises || []).filter(ex => !isWarmupCardExercise(ex));
}

// The reason line for a session's warm-up card, if it has one.
export function getWarmupWhy(exercises) {
  return (exercises || []).find(ex => ex?.warmupWhy)?.warmupWhy || null;
}
