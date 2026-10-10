// ─── MUSCLE REGION BREAKDOWN ───
// The muscle detail screen's "what part of it did you train" section. A
// muscle group like Back is several distinct muscles (lats, traps, rhomboids,
// rotator cuff, erectors); this splits the group's sets into those regions
// using the same name-driven sub-groups as the Add Exercise picker
// (src/data/exerciseSubgroups.js), so the two screens always agree.
//
// Kept out of muscleAnalytics.js on purpose: that module is also imported by
// api/push.js under plain Node ESM, and exerciseSubgroups.js uses
// extensionless imports Node can't resolve.

import { EXERCISE_SUBGROUPS } from '../data/exerciseSubgroups';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';
import { getMuscleWeight } from './muscleGroups';
import { isCountableSet, RECOMMENDED_EXERCISES, MUSCLE_TARGETS, classifyStatus, getHeatMapTier, getWeeklyMuscleStats } from './muscleAnalytics';
import { getLocalDateString, shiftLocalDateString } from './dateUtils';

// Every heat-map muscle that is really several muscles (or heads), split
// into its regions. Back/Chest/Shoulders/Biceps/Triceps/Core reuse the Add
// Exercise picker's sub-groups; the leg and forearm muscles are one chip each
// in the picker, so their parts are defined here. One region of each of those
// is the catch-all ("any calf raise that isn't bent-knee works the
// gastrocnemius"), so nothing lands in "Other". Tibialis is one muscle and
// has no breakdown.
//
// `split`: an exercise matching several regions (a plain Barbell Curl works
// both biceps heads) gives each an equal share of the set, so the regions
// still add up to the muscle's total. Without it the first match takes the
// whole set (Back's Face Pull counts once, in Trapezius).
const ARMS = EXERCISE_SUBGROUPS.Arms;
const GLUTE_MED = n => /abduct|clam ?shell|fire hydrant|lateral (band )?walk|monster walk|side.?lying (leg|hip)|crab walk|hip hike|side.?step/.test(n);
const SOLEUS = n => /seated|bent.?knee/.test(n);
const RECTUS_FEMORIS = n => /leg extension|knee extension|sissy|reverse nordic/.test(n);
const INNER_HAMSTRINGS = n => /curl|nordic|glute.?ham|\bghr\b/.test(n);
const FOREARM_EXTENSORS = n => /reverse (wrist )?curl|wrist extension|hammer|zottman|radial deviation/.test(n);

const REGIONS_BY_MUSCLE = {
  Back: { regions: EXERCISE_SUBGROUPS.Back },
  Chest: { regions: EXERCISE_SUBGROUPS.Chest },
  Shoulders: { regions: EXERCISE_SUBGROUPS.Shoulders },
  Biceps: { regions: ARMS.filter(r => r.id.startsWith('Biceps')), split: true },
  Triceps: { regions: ARMS.filter(r => r.id.startsWith('Triceps')), split: true },
  Core: { regions: EXERCISE_SUBGROUPS.Core, split: true },
  Forearms: {
    regions: [
      { id: 'Forearm Flexors', test: n => !FOREARM_EXTENSORS(n) },
      { id: 'Forearm Extensors', test: FOREARM_EXTENSORS },
    ],
  },
  Glutes: {
    regions: [
      { id: 'Glute Max', test: n => !GLUTE_MED(n) },
      { id: 'Glute Med', test: GLUTE_MED },
    ],
  },
  Quads: {
    regions: [
      { id: 'Rectus Femoris', test: RECTUS_FEMORIS },
      { id: 'Vastus Muscles', test: n => !RECTUS_FEMORIS(n) },
    ],
  },
  Hamstrings: {
    regions: [
      { id: 'Outer Hamstring', test: n => !INNER_HAMSTRINGS(n) },
      { id: 'Inner Hamstrings', test: INNER_HAMSTRINGS },
    ],
  },
  Calves: {
    regions: [
      { id: 'Gastrocnemius', test: n => !SOLEUS(n) },
      { id: 'Soleus', test: SOLEUS },
    ],
  },
};

// The Log Sets "behind this week" nudge keeps to the upper-body parts it was
// built for; every other muscle is nudged there as a whole muscle.
const GAP_REGION_MUSCLES = new Set(['Back', 'Chest', 'Shoulders']);

// Plain-language "what is this muscle and what does it do" for each region,
// shown on the detail screen instead of the picker's terse anatomy hint.
export const REGION_PLAIN = {
  Lats: 'The big wing-shaped muscles down the sides of your back. They pull your arms down and back, and make your back look wider.',
  Trapezius: 'The muscle from your neck out to your shoulders. It lifts and holds up your shoulders.',
  'Mid Back': 'The muscles between your shoulder blades. They squeeze the blades together and keep you standing tall.',
  'Rotator Cuff': 'Small muscles over each shoulder blade. They turn your arm and keep the shoulder joint stable and safe.',
  'Lower Back': 'The muscles along your lower spine. They keep your back straight when you bend, lift or stand.',
  'Upper Chest': 'The top of your chest, just under the collarbone. It fills out the chest at the top.',
  'Mid Chest': 'The middle and biggest part of your chest. It pushes your arms forward, like in a push-up.',
  'Lower Chest': 'The bottom edge of your chest. It pushes your arms down and forward, like in a dip.',
  'Front Delts': 'The front of your shoulder. It lifts your arm forward and overhead.',
  'Side Delts': 'The outside of your shoulder. It lifts your arm out to the side and gives your shoulders width.',
  'Rear Delts': 'The back of your shoulder. It pulls your arm backward and helps your posture.',
  'Biceps Long Head': 'The outer part of your biceps. It builds the "peak" — hammer and incline curls hit it most.',
  'Biceps Short Head': 'The inner part of your biceps. It adds thickness — preacher and concentration curls hit it most.',
  'Triceps Long Head': 'The biggest part of your triceps, at the back of the arm. Moves with your arm overhead hit it most.',
  'Triceps Lateral Head': 'The outer "horseshoe" of your triceps. Pushdowns, kickbacks and close-grip presses hit it most.',
  'Upper Abs': 'The top half of your six-pack. It curls your chest toward your hips, like in a crunch.',
  'Lower Abs': 'The bottom half of your six-pack. It lifts your legs and curls your hips up, like in a leg raise.',
  Obliques: 'The muscles on the sides of your waist. They twist your body and bend it to the side.',
  'Deep Core': 'The deep muscles under your abs. They hold your spine steady, like in a plank.',
  'Forearm Flexors': 'The palm side of your forearm. It closes your grip and bends your wrist — wrist curls, carries and hangs.',
  'Forearm Extensors': 'The back and thumb side of your forearm. It opens your hand and lifts your wrist — reverse and hammer curls.',
  'Glute Max': 'The big muscle of your bum. It drives your hips forward — hip thrusts, bridges, squats and lunges.',
  'Glute Med': 'The upper-outer part of your hip. It moves your leg out to the side and keeps your hips and knees stable.',
  'Rectus Femoris': 'The middle muscle down the front of your thigh. It straightens the knee and lifts the leg — leg extensions hit it most.',
  'Vastus Muscles': 'The outer and inner muscles of the front of your thigh. They straighten your knee in squats, leg presses and lunges.',
  'Outer Hamstring': 'The outer side of the back of your thigh. Hip hinges like Romanian deadlifts hit it most.',
  'Inner Hamstrings': 'The inner side of the back of your thigh. Leg curls and Nordic curls hit it most.',
  Gastrocnemius: 'The big calf muscle you can see. Calf raises with straight knees hit it most.',
  Soleus: 'The flat calf muscle underneath, down toward the ankle. Calf raises with bent knees (seated) hit it most.',
  Other: "Exercises for this muscle that don't focus on one part.",
};

export function hasRegions(muscle) {
  return Boolean(REGIONS_BY_MUSCLE[muscle]);
}

// The region(s) an exercise credits, in the list's order: every match for a
// `split` muscle, else only the first (Face Pull: upper + mid back → upper).
function regionsOf(muscle, name) {
  const cfg = REGIONS_BY_MUSCLE[muscle];
  if (!cfg) return [];
  const n = String(name || '').toLowerCase();
  const hits = cfg.regions.filter(r => r.test(n)).map(r => r.id);
  return cfg.split ? hits : hits.slice(0, 1);
}

// A region's weekly band is its share of the whole muscle's band, split
// evenly across the regions (Back 12–20 over 5 regions → 2–4 sets each).
// Hitting every region's band therefore lands the whole muscle in range.
export function regionBand(muscle) {
  const regions = REGIONS_BY_MUSCLE[muscle]?.regions;
  const band = MUSCLE_TARGETS[muscle];
  if (!regions || !band) return null;
  const n = regions.length;
  const min = Math.max(1, Math.round(band.min / n));
  const max = Math.max(min + 1, Math.round(band.max / n));
  return { min, max, target: Math.round((min + max) / 2) };
}

/**
 * Splits `muscle`'s working sets in [startStr, endStr] by region.
 * @returns {Array<{id, hint, sets, band, tier, lastTrained: {date, exercise}|null, exercises: Array<{name, sets}>, suggestions: string[]}>}
 *   one row per region (0-set regions included), plus an "Other" row only if
 *   some sets matched no region. For a `split` muscle `sets` can be a
 *   fraction (a set shared by two heads); `exercises[].sets` stays whole. `tier` is the heat map's Not Trained/Low/
 *   Optimal/High/Very High for the region against `band` (null for Other).
 */
export function getRegionBreakdownForMuscle(logs, muscle, startStr, endStr) {
  const regions = REGIONS_BY_MUSCLE[muscle]?.regions;
  if (!regions) return [];

  const rows = new Map(regions.map(r => [r.id, { id: r.id, hint: REGION_PLAIN[r.id] || r.hint, sets: 0, byExercise: {} }]));
  // Most recent session per region up to the window's end (any earlier week
  // too), so an untrained part can say when it was last worked, not just "0".
  const last = {};
  (logs || []).forEach(log => {
    if (!isCountableSet(log)) return;
    if (!log.log_date || log.log_date > endStr) return;
    const share = getMuscleWeight(log.exercise_name, muscle);
    if (!share) return;
    const ids = regionsOf(muscle, log.exercise_name);
    if (!ids.length) ids.push('Other');
    ids.forEach(id => {
      if (!last[id] || log.log_date > last[id].date) last[id] = { date: log.log_date, exercise: log.exercise_name };
      if (log.log_date < startStr) return;
      if (!rows.has(id)) rows.set(id, { id, hint: REGION_PLAIN.Other, sets: 0, byExercise: {} });
      const row = rows.get(id);
      row.sets += share / ids.length;
      row.byExercise[log.exercise_name] = (row.byExercise[log.exercise_name] || 0) + share;
    });
  });

  // Suggestions: the muscle's own recommended list first, then the library,
  // keeping only exercises that land in this region AND credit this muscle.
  const candidates = [...(RECOMMENDED_EXERCISES[muscle] || []), ...EXERCISE_LIBRARY.map(e => e.name)];
  const suggestionsFor = id => {
    const out = [];
    for (const name of candidates) {
      if (out.length >= 3) break;
      // "Deadlift" and "Deadlift (Barbell)" are one suggestion, not two.
      const base = name.replace(/\s*\(.*\)\s*$/, '').toLowerCase();
      if (out.some(o => o.replace(/\s*\(.*\)\s*$/, '').toLowerCase() === base)) continue;
      if (!regionsOf(muscle, name).includes(id)) continue;
      // Only suggest moves that really work it (a curl's quarter set of
      // forearm grip work doesn't make it a forearm exercise).
      if (getMuscleWeight(name, muscle) < 0.5) continue;
      out.push(name);
    }
    return out;
  };

  const band = regionBand(muscle);
  const tierFor = sets => getHeatMapTier({
    status: classifyStatus(sets, band),
    completionPercent: Math.round((sets / band.target) * 100),
  });

  return [...rows.values()].map(({ byExercise, ...row }) => ({
    ...row,
    // Halves stay halves; float noise from adding thirds/quarters doesn't.
    sets: Math.round(row.sets * 100) / 100,
    band: row.id === 'Other' ? null : band,
    tier: row.id === 'Other' ? null : tierFor(row.sets),
    lastTrained: last[row.id] || null,
    exercises: Object.entries(byExercise).map(([name, sets]) => ({ name, sets: Math.round(sets * 100) / 100 })).sort((a, b) => b.sets - a.sets),
    suggestions: row.id === 'Other' ? [] : suggestionsFor(row.id),
  }));
}

/**
 * What's under-trained over the last 7 days, worked out from flat per-set
 * rows: regions for Back/Chest/Shoulders (same as the muscle detail screen's
 * "Inside Back"), whole muscles for the rest. Untrained first, then by how
 * far short. One suggested exercise each.
 * @returns {Array<{label, sets, min, suggestion}>}
 */
export function getMuscleGaps(logs, today = getLocalDateString()) {
  const start = shiftLocalDateString(today, -6);
  const gaps = [];
  getWeeklyMuscleStats(logs, start, today).forEach(stat => {
    if (GAP_REGION_MUSCLES.has(stat.muscle)) {
      getRegionBreakdownForMuscle(logs, stat.muscle, start, today).forEach(r => {
        if (!r.band || r.sets >= r.band.min || !r.suggestions.length) return;
        gaps.push({ label: r.id, sets: r.sets, min: r.band.min, options: r.suggestions });
      });
    } else if (stat.sets < stat.min) {
      const options = RECOMMENDED_EXERCISES[stat.muscle] || [];
      if (options.length) gaps.push({ label: stat.muscle, sets: stat.sets, min: stat.min, options });
    }
  });
  gaps.sort((a, b) => (a.sets === 0) !== (b.sets === 0) ? (a.sets === 0 ? -1 : 1) : a.sets / a.min - b.sets / b.min);
  // One exercise per gap, never the same one twice (Face Pull fits both
  // Trapezius and Rear Delts): take each gap's first option not used yet.
  const used = new Set();
  return gaps.map(({ options, ...g }) => {
    const suggestion = options.find(o => !used.has(o.toLowerCase())) || options[0];
    used.add(suggestion.toLowerCase());
    return { ...g, suggestion };
  });
}
