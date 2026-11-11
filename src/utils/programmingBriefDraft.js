// The programming brief applied to an AI draft: the hard rules the model is
// given, the post-check that holds each returned day to the brief, the
// weekly set count, and the short summary the coach sees above the draft.
//
// Pure (no network, database, clock or randomness) and shared: the api/
// function runs all of it; the coach screen re-runs weeklySetWarnings after
// "Regenerate this day" so the week's totals stay current.

import { INJURY_AREAS, BRIEF_WARNINGS, EXCLUSION_REASON_TEXT } from '../data/aiProgrammingRules.js';
import { matchCatalogExercise } from './aiWorkoutCatalog.js';
import { exerciseNameKey } from './exerciseName.js';
import { getExerciseTags } from './exerciseTags.js';
import { withArticle } from './programmingBrief.js';
import { getMuscleGroupsForExercise, parseMuscleText, LARGE_MUSCLES, SECONDARY_WEIGHT } from './muscleGroups.js';

const fill = (template, values) =>
  template.replace(/\{(\w+)\}/g, (m, k) => (values[k] !== undefined ? String(values[k]) : m));

// Ranges are written "8 to 10", never "8–10": with a dash the model copied
// the range straight into "reps" (`"reps": 8–10`), which isn't JSON, and
// Groq rejected the whole draft (json_validate_failed on 5-day drafts).
const range = ([lo, hi], unit = '') => (lo === hi ? `${lo}${unit}` : `${lo} to ${hi}${unit}`);
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

const IMPACT_RULE = {
  low: 'No jumps, landings or running (impact capped at low).',
  none: 'No impact at all: seated, lying or supported exercises only.'
};

// The brief as hard rules for the system prompt. It replaces the old
// "use the client's stats to size the program" line: the sizing is decided
// here, in code, and the model is told the result.
export function briefPromptRules({ brief, preferred = {} }) {
  if (!brief) return '';
  const b = brief;
  const lines = [
    `CLIENT PROGRAMMING RULES — hard limits, computed from the client's profile. Follow them exactly; the coach's instructions may change the split, focus and exercise choice, never these limits.`,
    `- Level: ${b.level}. Default split if the coach gives none: ${b.defaultSplit}.`,
    `- Each day: ${range(b.exercisesPerDay)} exercises, the ${range(b.compoundLiftsPerDay)} big compound lift${b.compoundLiftsPerDay[1] === 1 ? '' : 's'} first.`,
    `- Sets per exercise: ${range(b.setsPerExercise)}. Reps per set: main compound lifts ${range(b.reps.mainLifts)}, accessories ${range(b.reps.accessories)}. Timed holds: ${range(b.reps.holdSeconds, ' s')} (durationMinutes ${range(b.reps.holdSeconds.map(s => Math.round((s / 60) * 100) / 100))}).`,
    `- In the JSON, "setCount" and "reps" are each ONE whole number chosen inside those ranges (for example 10), and "durationMinutes" is ONE number (for example 0.5) — never a range, a dash or text.`,
    `- Weekly working sets per muscle: large muscles (chest, back, shoulders, quads, hamstrings, glutes) about ${b.weeklySets.large.target}, never above ${b.weeklySets.large.cap}; small muscles (biceps, triceps, calves, forearms, core) about ${b.weeklySets.small.target}, never above ${b.weeklySets.small.cap}.`,
    `- Leave at least ${b.minRestHoursSameMuscle} h before training the same muscle again.`,
    b.cardio.required && b.cardio.available === false
      ? '- Cardio: no cardio exercise in the library is allowed for this client — leave cardio out.'
      : b.cardio.required
      ? `- Cardio: finish every day with ${range(b.cardio.minutes, ' min')} of ${b.cardio.style}${b.cardio.intervals ? ` (intervals of ${range(b.cardio.intervals, ' min')} are allowed)` : ''}${b.cardio.preferred.length ? `, using ${b.cardio.preferred.join(' or ')}` : ''}.`
      : `- Cardio: optional, at most ${b.cardio.minutes[1]} min a day.`,
    b.cardio.coreEveryDay ? '- Include one core exercise every day.' : null,
    b.age?.perDay?.includes('balance') ? '- Include one balance exercise every day.' : null,
    b.age?.perDay?.includes('coreStabilityOrMobility') ? '- Include one core-stability or mobility exercise every day.' : null,
    b.age?.preferMachines || b.bmi?.preferSupported ? '- Prefer machines and seated or supported exercises.' : null,
    b.impactCap ? `- ${IMPACT_RULE[b.impactCap]}` : null,
    ...b.injuries.map(a => `- ${INJURY_AREAS[a].label} injury: exercises that load it are already removed from the library.${preferred[a]?.length ? ` Good substitutes: ${preferred[a].join(', ')}.` : ''}`),
    '- The exercise library below is already filtered for this client (injuries, impact, difficulty, equipment): every listed exercise is allowed.'
  ];
  return lines.filter(Boolean).join('\n');
}

// The client facts the model still needs as context (no name, no
// placeholder weight).
export function briefClientLines(brief) {
  if (!brief) return [];
  const c = brief.client;
  return [
    c.age ? `Age: ${c.age}` : null,
    c.sex ? `Sex: ${c.sex}` : null,
    c.heightCm ? `Height: ${c.heightCm} cm` : null,
    c.weightKg ? `Weight: ${c.weightKg} kg` : null,
    `Goal: ${brief.goals.join(' + ')}`
  ].filter(Boolean);
}

const reasonText = (reason) => {
  if (reason.startsWith('injury:')) return `${INJURY_AREAS[reason.slice(7)]?.label.toLowerCase() || 'injury'} injury`;
  return EXCLUSION_REASON_TEXT[reason] || reason;
};

// One returned day held to the brief:
// - every exercise maps onto the client's catalog (library spelling); one the
//   brief excluded is removed with a coach note, one not in the library is
//   dropped as before; repeats within the day are dropped;
// - sets and reps (hold/cardio minutes) are clamped into the brief's ranges —
//   the first strength exercises (the minimum compound-lift count) use the
//   main lift reps, the rest the accessory reps;
// - an untagged exercise is flagged when the brief says to.
// Returns { day: null when nothing survives, warnings: [text] }.
export function checkDraftDay(day, { brief, catalog = [], excluded = [], dayLabel }) {
  const label = dayLabel || day.dayLabel || 'Day';
  const excludedByKey = new Map(excluded.map(e => [exerciseNameKey(e.name), e]));
  const warnings = [];
  const seen = new Set();
  const kept = [];
  for (const ex of day.exercises || []) {
    let name = ex.name;
    if (catalog.length) {
      const record = matchCatalogExercise(ex.name, catalog);
      if (!record) continue; // not in the library (logged by the caller)
      name = record.name;
      const hit = excludedByKey.get(exerciseNameKey(name));
      if (hit) {
        warnings.push(fill(BRIEF_WARNINGS.removed, { day: label, name, why: hit.reasons.map(reasonText).join(', ') }));
        continue;
      }
    }
    const key = exerciseNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ ...ex, name });
  }

  let changed = 0;
  let strengthSeen = 0;
  const exercises = kept.map(ex => {
    const out = { ...ex };
    if (ex.type === 'strength' || ex.type === 'timed') {
      if (Number.isFinite(ex.setCount)) out.setCount = clamp(Math.round(ex.setCount), brief.setsPerExercise);
    }
    if (ex.type === 'strength') {
      // The guaranteed compound lifts (the range's lower end) lead the day.
      const reps = strengthSeen < brief.compoundLiftsPerDay[0] ? brief.reps.mainLifts : brief.reps.accessories;
      strengthSeen += 1;
      if (Number.isFinite(ex.reps)) out.reps = clamp(Math.round(ex.reps), reps);
    } else if (ex.type === 'timed' && Number.isFinite(ex.durationMinutes)) {
      const mins = brief.reps.holdSeconds.map(s => s / 60);
      out.durationMinutes = Math.round(clamp(ex.durationMinutes, mins) * 100) / 100;
    } else if (ex.type === 'cardio' && Number.isFinite(ex.durationMinutes)) {
      const hi = Math.max(brief.cardio.minutes[1], brief.cardio.intervals?.[1] || 0);
      out.durationMinutes = clamp(ex.durationMinutes, [Math.max(1, brief.cardio.minutes[0]), hi || 1]);
    }
    if (out.setCount !== ex.setCount || out.reps !== ex.reps || out.durationMinutes !== ex.durationMinutes) changed += 1;
    return out;
  });
  if (changed) warnings.push(fill(BRIEF_WARNINGS.clamped, { day: label, count: changed, s: changed === 1 ? '' : 's' }));

  if (brief.flagUntagged) {
    exercises.filter(e => !getExerciseTags(e.name))
      .forEach(e => warnings.push(fill(BRIEF_WARNINGS.untaggedInDraft, { day: label, name: e.name })));
  }
  return { day: exercises.length ? { ...day, exercises } : null, warnings };
}

// Working sets per muscle across the week's days ({ exercises: [{ name,
// type, setCount }] }): the main muscle gets every set, a second muscle
// SECONDARY_WEIGHT of them. Cardio doesn't count.
export function weeklySetsByMuscle(days, catalog = []) {
  const byKey = new Map(catalog.map(e => [exerciseNameKey(e.name), e]));
  const totals = new Map();
  (days || []).forEach(d => (d?.exercises || []).forEach(ex => {
    if (ex.type === 'cardio') return;
    const sets = Number(ex.setCount) || 0;
    if (!sets) return;
    const groups = getMuscleGroupsForExercise(ex.name).length
      ? getMuscleGroupsForExercise(ex.name)
      : parseMuscleText(byKey.get(exerciseNameKey(ex.name))?.muscle);
    groups.slice(0, 2).forEach((g, i) => totals.set(g, (totals.get(g) || 0) + sets * (i === 0 ? 1 : SECONDARY_WEIGHT)));
  }));
  return totals;
}

// Over the weekly cap is a coach warning, never a retry (the Groq per-minute
// token limit can't afford one).
export function weeklySetWarnings(days, brief, catalog = []) {
  if (!brief) return [];
  const out = [];
  weeklySetsByMuscle(days, catalog).forEach((sets, muscle) => {
    const cap = (LARGE_MUSCLES.has(muscle) ? brief.weeklySets.large : brief.weeklySets.small).cap;
    if (sets > cap) out.push(fill(BRIEF_WARNINGS.overCap, { muscle, sets: Math.round(sets * 10) / 10, cap, aLevel: withArticle(brief.level) }));
  });
  return out;
}

// What the coach sees above the draft ("Built for this client").
export function briefSummary(brief, excluded = []) {
  if (!brief) return null;
  return {
    level: brief.level,
    levelSource: brief.levelSource,
    goals: brief.goals,
    reps: brief.reps,
    setsPerExercise: brief.setsPerExercise,
    exercisesPerDay: brief.exercisesPerDay,
    cardio: { goal: brief.cardio.goal, required: brief.cardio.required, minutes: brief.cardio.minutes },
    impactCap: brief.impactCap,
    difficultyCap: brief.difficultyCap,
    injuries: brief.injuries.map(a => INJURY_AREAS[a].label),
    excludedCount: excluded.length,
    weeklySets: brief.weeklySets,
    ageBand: brief.age?.band || null,
    bmi: brief.bmi ? { value: brief.bmi.value, band: brief.bmi.band } : null,
    equipment: brief.equipment,
    missing: brief.missing,
    safetyCapsLifted: brief.safetyCapsLifted
  };
}
