// "Busy?" line on a logger card: whatever an exercise needs (machine, cable,
// dumbbells, a barbell) may be taken, so offer the closest stand-ins that
// don't need it, in one tap — on every exercise. Same library and match % as the ≡ menu's Swap sheet
// (swapAlternatives / swapMatchPercent), so the two never disagree.
import { equipmentLabel, isSameExerciseName, swapAlternatives, swapMatchPercent } from './aiWorkoutCatalog';
import { libraryExerciseId } from './exerciseName';

// Stations people queue for. The name says "Machine"/"Cable"/"Smith", or it's
// a machine by nature even when the name doesn't say so.
const MACHINE_BY_NATURE = /(leg press|hack squat|pec deck|pull ?down|leg curl|leg extension|seated row|high row|hip (ab|ad)duction|calf raise \(machine\)|seated leg curl|reverse fly machine|chest press)/i;

export function isStationExercise(name) {
  const equip = equipmentLabel(name);
  return equip === 'Machine' || equip === 'Cable' || MACHINE_BY_NATURE.test(String(name || ''));
}

// What the exercise needs that might be taken: a station (machine/cable),
// or a kind of free weight. Bodyweight and anything else needs nothing.
const needOf = (name) => {
  if (isStationExercise(name)) return 'station';
  const equip = equipmentLabel(name);
  return equip === 'Dumbbell' || equip === 'Barbell' || equip === 'Kettlebell' || equip === 'Band' ? equip : null;
};

// The few words before the chip: what this exercise needs that someone else
// may be using. The name's equipment word first ("Cable busy?", "Dumbbells
// taken?"); names without one ("Decline Bench Press", "Back Squat") by the
// station they're done at; floor work → "Mat taken?"; anything else "Spot".
const PROMPT = {
  Cable: 'Cable busy?', Machine: 'Machine busy?', Barbell: 'Barbell busy?',
  Dumbbell: 'Dumbbells taken?', Kettlebell: 'Kettlebell taken?', Band: 'Band taken?'
};
const BY_STATION = [
  [/\b(push-?down|rope|face pull|cross-?over|wood-?chop|pull-?through|straight[- ]arm|pallof)/i, 'Cable busy?'],
  [/\b(cycling|bike)\b/i, 'Bike busy?'],
  [/\b(running|jogging|walking|incline walk|treadmill)\b/i, 'Treadmill busy?'],
  [/\b(cross trainer|steppers?|elliptical|rower|calf raise|tib bar)/i, 'Machine busy?'],
  [/\b(pull-?ups?|chin-?ups?|dips?|hanging|muscle-?ups?|inverted row)\b/i, 'Bar taken?'],
  [/\b(box jump|step-?ups?)\b/i, 'Box taken?'],
  [/\bball\b/i, 'Ball taken?'],
  [/\bbench\b|\b(incline|decline) press\b|hip thrust|preacher|hyperextension|back extension|nordic/i, 'Bench taken?'],
  [/\b(pendlay|t-bar|landmine|push press|straight bar|behind neck|reverse curl)/i, 'Barbell busy?'],
  [/\b(squat|deadlift|rack|good morning|overhead press|military press|clean|snatch|lunge)/i, 'Rack taken?'],
  [/\b(lateral raise|front raise|arnold|curls?\b|kickback|rear delt|reverse fly|shrug|one arm row|triceps extension|skullcrusher|farmer|floor press|around the world|upright row|shoulders? press)/i, 'Dumbbells taken?'],
  [/\b(plank|crunch|bird ?dog|dead ?bug|bridge|sit[- ]?up|leg raise|push-?up|mountain climber|superman|hollow|flutter|v[- ]?up|russian twist|stretch|yoga|side lying|clamshell|ab wheel|heel taps|windshield|shoulder taps|wall sit|cat camel)/i, 'Mat taken?']
];
export function busyPrompt(name) {
  const n = String(name || '');
  const equip = equipmentLabel(n);
  if (PROMPT[equip]) return PROMPT[equip];
  if (MACHINE_BY_NATURE.test(n)) return 'Machine busy?';
  const hit = BY_STATION.find(([re]) => re.test(n));
  return hit ? hit[1] : 'Spot taken?';
}

// Every exercise card offers swaps.
export function isBusyEligible(name) {
  return !!String(name || '').trim();
}

// A stand-in must not need the thing that's busy: no station for a station
// exercise, no dumbbells for a dumbbell one, no barbell for a barbell one.
const freeOfSame = (name, alt) => {
  const need = needOf(name);
  return !need || needOf(alt) !== need;
};

const MIN_MATCH = 50;

// Bodyweight moves most people can't do yet: still offered, but after the
// rest, so "Lat Pull Down" doesn't lead with Pull-up. Assisted versions are
// easy and stay where they rank.
const HARD = /(pull-?up|chin-?up|muscle-?up|\bdips?\b|nordic|pistol|handstand|sternum)/i;
const isHard = (name) => HARD.test(name) && !/assisted/i.test(name);

// → up to `limit` of { name, exerciseId, match }, best first (hard moves
// last). `excludeNames`: exercises already in today's workout, so it never
// suggests something they're about to do anyway.
export function busyAlternatives(name, catalog, excludeNames = [], limit = 3) {
  if (!isBusyEligible(name) || !Array.isArray(catalog) || catalog.length === 0) return [];
  if (!alternativesCache.has(catalog)) alternativesCache.set(catalog, new Map());
  const cache = alternativesCache.get(catalog);
  const key = JSON.stringify([name, limit, catalog.length, excludeNames]);
  if (!cache.has(key)) {
    if (cache.size >= MAX_CACHED) cache.clear();
    cache.set(key, rankAlternatives(name, catalog, excludeNames, limit));
  }
  return cache.get(key).map(a => ({ ...a }));
}

// Every card asks on every logger render (each keystroke, each clock second)
// and one answer ranks the whole library, so they're kept per catalog until
// the workout's exercises change.
const alternativesCache = new WeakMap();
const MAX_CACHED = 300;

function rankAlternatives(name, catalog, excludeNames, limit) {
  return swapAlternatives(name, catalog, { exclude: excludeNames, limit: 24 })
    .filter(e => !isSameExerciseName(name, e.name) && freeOfSame(name, e.name))
    .map(e => ({ e, match: swapMatchPercent(name, e, catalog) }))
    .filter(x => x.match >= MIN_MATCH)
    .sort((a, b) => (isHard(a.e.name) - isHard(b.e.name)) || (b.match - a.match))
    .slice(0, limit)
    .map(({ e, match }) => ({ name: e.name, exerciseId: libraryExerciseId(e), match }));
}

// Busy? swaps chain: the card always offers stand-ins for the exercise the
// plan started with (`busyBase`), skipping everything already tried
// (`busyTried`), up to MAX_BUSY_SWAPS in a row. A card swapped from the ≡
// menu (swappedFrom without busyBase) gets no Busy? line.
export const MAX_BUSY_SWAPS = 3;

export function nextBusyOption(entry, catalog, workoutNames = []) {
  if (!entry || (entry.sets || []).some(s => s.isCompleted)) return null;
  const base = entry.busyBase || (entry.swappedFrom ? null : entry.name);
  if (!base) return null;
  const tried = entry.busyTried || [];
  if (tried.length >= MAX_BUSY_SWAPS) return null;
  const [next] = busyAlternatives(base, catalog, [...workoutNames, ...tried], 1);
  return next ? { ...next, base, tried: [...tried, next.name] } : null;
}
