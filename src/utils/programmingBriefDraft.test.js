import { describe, it, expect } from 'vitest';
import { buildProgrammingBrief } from './programmingBrief.js';
import { briefPromptRules, briefClientLines, checkDraftDay, weeklySetsByMuscle, weeklySetWarnings, briefSummary } from './programmingBriefDraft.js';
import { EXERCISE_TAGS } from '../data/exerciseTags.js';

const CUSTOM = { name: "Coach's Sandbag Shoulder Toss", muscle: 'Shoulders', category: 'Shoulders' };
const CATALOG = [...EXERCISE_TAGS.map(([name]) => ({ name, muscle: '', category: '' })), CUSTOM];
const make = (over = {}) => buildProgrammingBrief({
  profile: { age: 30, heightCm: 175, weightKg: 70, sex: 'male', goal: 'Muscle Building' },
  level: 'intermediate',
  catalog: CATALOG,
  ...over
});
const s = (name, setCount = 3, reps = 10) => ({ name, type: 'strength', setCount, reps, durationMinutes: null, notes: null });

describe('briefPromptRules', () => {
  it('states the brief as hard limits', () => {
    const { brief, preferred } = make({ injuryAreas: ['knee'], profile: { age: 62, heightCm: 170, weightKg: 95.4, sex: 'female', goal: 'Fat Loss' }, level: 'beginner' });
    const text = briefPromptRules({ brief, preferred });
    expect(text).toMatch(/^CLIENT PROGRAMMING RULES/);
    expect(text).toMatch(/Each day: 4–5 exercises, the 2 big compound lifts first/);
    expect(text).toMatch(/Reps per set: main compound lifts 10–15, accessories 10–15/);
    expect(text).toMatch(/large muscles .* about 8, never above 10/);
    expect(text).toMatch(/Cardio: finish every day with 10–15 min of easy cardio to finish every day, using Cycling/);
    expect(text).toMatch(/one balance exercise every day/);
    expect(text).toMatch(/No impact at all/);
    expect(text).toMatch(/Knee injury: .* Good substitutes: Glute Bridge/);
  });

  it('is empty without a brief', () => {
    expect(briefPromptRules({ brief: null })).toBe('');
  });

  it('client lines carry no name and no placeholder weight', () => {
    const { brief } = make({ profile: { age: 30, heightCm: 175, sex: 'male', goal: 'Fat Loss' } });
    expect(briefClientLines(brief)).toEqual(['Age: 30', 'Sex: male', 'Height: 175 cm', 'Goal: Fat Loss']);
  });
});

describe('checkDraftDay', () => {
  it('removes excluded exercises with the reason, maps spellings, drops repeats', () => {
    const { brief, excluded } = make({ injuryAreas: ['knee'] });
    const r = checkDraftDay({ dayLabel: 'Day 1', exercises: [s('bench press (barbell)'), s('Leg Press'), s('Bench Press (Barbell)'), s('Face Pulls')] }, { brief, catalog: CATALOG, excluded });
    expect(r.day.exercises.map(e => e.name)).toEqual(['Bench Press (Barbell)', 'Face Pull']);
    expect(r.warnings).toContain('Day 1: removed Leg Press (knee injury).');
  });

  it('names every reason an exercise was removed', () => {
    const { brief, excluded } = make({ level: 'beginner', profile: { age: 65, heightCm: 175, weightKg: 70, goal: 'Fat Loss' } });
    const r = checkDraftDay({ dayLabel: 'Mon', exercises: [s('Push Press'), s('Chest Press (Machine)')] }, { brief, catalog: CATALOG, excluded });
    expect(r.warnings[0]).toBe('Mon: removed Push Press (impact limit, too advanced for the level, age rule).');
  });

  it('clamps sets and reps: the first compound lifts use main-lift reps, the rest accessory reps', () => {
    const { brief, excluded } = make(); // intermediate MB: sets 3, main 8–10, accessories 10–12
    const r = checkDraftDay({ dayLabel: 'D', exercises: [s('Bench Press (Barbell)', 5, 5), s('Barbell Row', 3, 9), s('Lateral Raise', 1, 20)] }, { brief, catalog: CATALOG, excluded });
    expect(r.day.exercises.map(e => [e.setCount, e.reps])).toEqual([[3, 8], [3, 9], [3, 12]]);
    expect(r.warnings).toContain("D: sets/reps adjusted on 2 exercises to fit the client's ranges.");
  });

  it('clamps hold and cardio minutes', () => {
    const { brief, excluded } = make({ profile: { age: 30, heightCm: 175, weightKg: 70, sex: 'male', goal: 'Fat Loss' } });
    const r = checkDraftDay({ dayLabel: 'D', exercises: [
      { name: 'Plank', type: 'timed', setCount: 3, reps: null, durationMinutes: 3, notes: null },
      { name: 'Cycling', type: 'cardio', setCount: 1, reps: null, durationMinutes: 40, notes: null }
    ] }, { brief, catalog: CATALOG, excluded });
    expect(r.day.exercises[0].durationMinutes).toBe(0.75); // 45 s max for intermediate
    expect(r.day.exercises[1].durationMinutes).toBe(15);
  });

  it('flags untagged exercises only when the brief says to', () => {
    const withInjury = make({ injuryAreas: ['knee'] });
    const day = { dayLabel: 'D', exercises: [s(CUSTOM.name), s('Face Pull'), s('Cable Curl')] };
    expect(checkDraftDay(day, { ...withInjury, catalog: CATALOG }).warnings)
      .toContain(`D: ${CUSTOM.name} has no safety tags (custom or new exercise) — check it suits this client.`);
    const plain = make();
    expect(checkDraftDay(day, { ...plain, catalog: CATALOG }).warnings.join(' ')).not.toMatch(/safety tags/);
  });

  it('returns null when nothing survives', () => {
    const { brief, excluded } = make({ injuryAreas: ['knee'] });
    expect(checkDraftDay({ dayLabel: 'D', exercises: [s('Leg Press'), s('Not A Real Move')] }, { brief, catalog: CATALOG, excluded }).day).toBeNull();
  });
});

describe('weekly sets', () => {
  it('counts the main muscle fully and a second muscle at half', () => {
    const totals = weeklySetsByMuscle([{ exercises: [s('Bench Press (Barbell)', 3), s('Cycling', 1)] }], CATALOG);
    expect(totals.get('Chest')).toBe(3);
    expect(totals.get('Triceps')).toBe(1.5);
    expect(totals.has('Quads')).toBe(false);
  });

  it('warns per muscle over the level cap', () => {
    const { brief } = make({ level: 'beginner' });
    const days = [{ exercises: [s('Chest Press (Machine)', 3), s('Pec Deck Fly', 3), s('Cable Fly', 3)] }, { exercises: [s('Chest Press (Machine)', 3)] }];
    expect(weeklySetWarnings(days, brief, CATALOG)).toEqual(['Chest: 12 sets this week, above the 10-set cap for a beginner client. Consider trimming one Chest exercise.']);
    expect(weeklySetWarnings(days, null, CATALOG)).toEqual([]);
  });
});

describe('briefSummary', () => {
  it('carries what the coach sees above the draft', () => {
    const { brief, excluded } = make({ injuryAreas: ['knee', 'shoulder'], profile: { goal: 'Fat Loss' } });
    expect(briefSummary(brief, excluded)).toMatchObject({
      level: 'intermediate', injuries: ['Knee', 'Shoulder'], impactCap: null,
      reps: { mainLifts: [8, 12], accessories: [12, 15] },
      missing: ['age', 'sex', 'height', 'weight'], excludedCount: excluded.length
    });
    expect(briefSummary(null)).toBeNull();
  });
});
