// AI Workout Draft Builder — server-side generation only. This endpoint NEVER
// writes to the database; it only returns a structured draft for the coach to
// review/edit in the existing plan editor. Saving/assigning happens through
// the same databaseService.saveWorkoutPlan() path the manual editor already
// uses, triggered client-side only when the coach explicitly presses
// "Assign Workout Plan" (see TrainerDashboard.jsx).
//
// Uses Groq's free tier (GPT-OSS-120B) via raw REST (OpenAI-compatible chat
// completions API, no SDK dependency — same pattern as every other external
// call in this api/ folder) — no billing required, and unlike Gemini's free
// tier this isn't subject to per-region quota=0 restrictions.
//
// Output shape (2026-11-11): Groq supports strict structured outputs for
// gpt-oss-120b — response_format json_schema with strict: true constrains
// decoding to DRAFT_SCHEMA / DAY_RESPONSE_SCHEMA below, so the JSON always has
// every field with the right type and `type` is always one of the three
// allowed values. Strict mode has no optional fields, so reps /
// durationMinutes / notes are required-but-nullable (the client's converter
// treats null exactly like a missing field). If Groq ever rejects the schema
// (HTTP 400), the call is repeated once with plain json_object mode and that
// fallback is logged. What a schema can't express is still checked here:
// validateDraft() (non-empty days/names), repairDay() (library names, no
// repeats) and the top-up loop (exactly N days, enough exercises per day).
//
// Library-only exercises (2026-10-23): the client sends its exercise catalog
// (DB catalog + the coach's custom exercises + code library, see
// src/utils/aiWorkoutCatalog.js) and the prompt lists it grouped by body area.
// The model may only pick from it, and repairDay() below maps every name it
// returns back onto a catalog record (or drops it) before the draft reaches
// the coach — so every exercise arrives with its library spelling, Form Guide
// video and PREV. `mode: 'day'` regenerates a single day of an existing
// draft with the same prompt pieces, one level narrower.
//
// Programming brief (2026-11-11): the server computes the client's brief
// itself from the request (src/utils/programmingBrief.js — never a brief the
// browser sends) with the rules in src/data/aiProgrammingRules.js. The model
// sees only the brief's allowed catalog and gets the brief as hard rules;
// every returned day — full draft, top-up day and "regenerate this day" — is
// then held to it in code (checkDraftDay: excluded exercises removed, sets
// and reps clamped), and the week's sets per muscle are counted. Anything
// adjusted, and any weekly cap exceeded, comes back as a coach warning —
// never an extra Groq call. A request with no level at all (an older cached
// client) gets no brief and the previous behaviour, response shape included.

import { formatCatalogForPrompt, matchCatalogExercise } from '../src/utils/aiWorkoutCatalog.js';
import { exerciseNameKey } from '../src/utils/exerciseName.js';
import { buildProgrammingBrief, matchInjuryAreas } from '../src/utils/programmingBrief.js';
import { briefPromptRules, briefClientLines, checkDraftDay, weeklySetWarnings, briefSummary } from '../src/utils/programmingBriefDraft.js';
import { INJURY_AREAS } from '../src/data/aiProgrammingRules.js';

const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const DRAFT_JSON_SHAPE = `{
  "programSummary": "1-2 sentence explanation of how this program is structured and why",
  "days": [
    {
      "dayLabel": "e.g. Monday, or Day 1",
      "focus": "e.g. Push, Upper Body, Legs",
      "planName": "short plan name, e.g. Push Day — Chest & Shoulders",
      "exercises": [
        {
          "name": "exercise name",
          "type": "strength | cardio | timed",
          "setCount": 3,
          "reps": 10,
          "durationMinutes": null,
          "notes": null
        }
      ]
    }
  ]
}

"reps" is for strength exercises (null otherwise); "durationMinutes" is for cardio and timed holds (null otherwise, may be a decimal such as 0.5); "notes" is an optional short coaching cue or null.`;

const DAY_JSON_SHAPE = `{
  "day": {
    "dayLabel": "the same day label you were given",
    "focus": "e.g. Push, Upper Body, Legs",
    "planName": "short plan name",
    "exercises": [ { same exercise fields as in "days[].exercises" above } ]
  }
}`;

// Strict JSON schemas for Groq structured outputs (see the header). Strict
// mode requires every property in `required` and additionalProperties: false
// on every object; optional values are type unions with null. Inlined rather
// than $ref'd to keep to the most basic, documented subset.
const EXERCISE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'type', 'setCount', 'reps', 'durationMinutes', 'notes'],
  properties: {
    name: { type: 'string' },
    type: { type: 'string', enum: ['strength', 'cardio', 'timed'] },
    setCount: { type: 'integer' },
    reps: { type: ['integer', 'null'] },
    durationMinutes: { type: ['number', 'null'] },
    notes: { type: ['string', 'null'] }
  }
};

const DAY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dayLabel', 'focus', 'planName', 'exercises'],
  properties: {
    dayLabel: { type: 'string' },
    focus: { type: 'string' },
    planName: { type: 'string' },
    exercises: { type: 'array', items: EXERCISE_SCHEMA }
  }
};

export const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['programSummary', 'days'],
  properties: {
    programSummary: { type: 'string' },
    days: { type: 'array', items: DAY_SCHEMA }
  }
};

export const DAY_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['day'],
  properties: { day: DAY_SCHEMA }
};

export const responseFormatFor = (isDay, strict = true) => (strict
  ? { type: 'json_schema', json_schema: { name: isDay ? 'workout_day' : 'workout_draft', strict: true, schema: isDay ? DAY_RESPONSE_SCHEMA : DRAFT_SCHEMA } }
  : { type: 'json_object' });

// Per mode: a full draft (and each top-up day that completes one) should be
// conventional and repeatable; "regenerate this day" exists to get something
// different, so it keeps more variety.
export const TEMPERATURE_FULL = 0.4;
export const TEMPERATURE_REGENERATE_DAY = 0.7;

const catalogRules = (catalog) => (catalog.length === 0 ? '' : `
EXERCISE LIBRARY (grouped by body area) — you may ONLY use exercises from this list, spelled exactly as written (copy each name character for character, including anything in brackets). Never invent, rename or combine names. If the ideal exercise isn't listed, pick the closest listed one for the same muscle.
${formatCatalogForPrompt(catalog)}
`);

// "5-7", or the brief's own exercises-per-day range.
const perDayText = (brief) => (brief ? brief.exercisesPerDay.join('-') : '5-7');

const buildSystemPrompt = (catalog = [], mode = 'full', brief = null, preferred = {}) => `You are an assistant that drafts workout programs for a fitness coach. The coach reviews, edits, and approves every draft before anything is assigned to a client — you are not making the final call, so favor practical, conventional programming over anything experimental.

${brief ? `${briefPromptRules({ brief, preferred })}

Other rules:` : `Rules:
- Use the client's stats (age, weight, height, goal, calories, protein target) to size the program appropriately — do not ignore them.`}
- If injuries or medical restrictions are mentioned, you MUST avoid exercises that load or aggravate that area, and say so in a note on the safer substitute exercise.
- Respect the coach's written instructions as the primary source of truth — advanced-option hints are secondary, the free-text instructions take priority if they conflict.
- Keep weekly volume balanced across muscle groups — do not overload one muscle group across multiple days without adequate recovery between sessions.
- Apply progressive overload thinking (e.g. slightly higher volume/intensity on primary lifts vs accessories) but do not invent specific weights — the coach fills those in.
- Only output real, recognizable exercises a coach would actually program. No invented or joke exercise names.
- "type" must be exactly "strength", "cardio", or "timed" — strength = reps+weight sets, cardio = distance/time, timed = isometric hold.
- "reps" is a single target number per set, never a range like "8-10".
- Do not include rest days as entries in "days".
- Order each day with the big compound lifts first, then accessories, then core/cardio last. ${perDayText(brief)} exercises per day${brief ? '' : ' unless the session length calls for fewer or more'}.
- Never repeat the same exercise twice in one day.
${catalogRules(catalog)}
Respond with ONLY valid JSON matching this exact shape — no prose, no markdown code fences, no commentary before or after:
${mode === 'day' ? `${DAY_JSON_SHAPE}\n\nwhere each exercise has the fields shown here:\n${DRAFT_JSON_SHAPE}` : DRAFT_JSON_SHAPE}`;

// No client name is ever sent to Groq. With a brief, the stats come from it
// (no placeholder weight); without one (older client), from the request.
const buildUserPrompt = ({ client, instructions, options, day, brief = null }) => {
  const lines = [
    '=== Client Profile ===',
    ...(brief ? briefClientLines(brief) : [
      client.age ? `Age: ${client.age}` : null,
      client.sex || client.gender ? `Sex: ${client.sex || client.gender}` : null,
      client.height ? `Height: ${client.height} cm` : null,
      client.weight ? `Weight: ${client.weight} kg` : null,
      client.goal ? `Fitness goal: ${client.goal}` : null
    ]),
    client.calories ? `Daily calorie target: ${client.calories} kcal` : null,
    client.protein ? `Daily protein target: ${client.protein} g` : null,
    client.experienceLevel ? `Experience level: ${client.experienceLevel}` : null,
    client.injuries ? `Injuries / pain points: ${client.injuries}` : null,
    client.equipment ? `Equipment available: ${client.equipment}` : null,
    '',
    '=== Advanced Options (hints only, coach instructions below take priority if they conflict) ===',
    options.workoutLengthMinutes ? `Target session length: ~${options.workoutLengthMinutes} min` : null,
    options.trainingDays ? `Training days per week: ${options.trainingDays}` : null,
    options.split ? `Preferred split: ${options.split}` : null,
    options.difficulty ? `Difficulty level: ${options.difficulty}` : null,
    '',
    '=== Coach Instructions ===',
    instructions?.trim() || '(none given — use the profile and advanced options above to design a sensible program)',
    ...(day ? [
      '',
      '=== Regenerate ONE day only ===',
      `Rewrite only this day of the existing program: ${day.dayLabel}${day.focus ? ` (${day.focus})` : ''}.`,
      `Keep the same focus so the week stays balanced, but use mostly DIFFERENT exercises from the current version of this day: ${(day.currentExercises || []).join(', ') || '(none)'}.`,
      day.doNotUse?.length ? `DO NOT USE any of these exercises — your last version repeated too many of them: ${day.doNotUse.join(', ')}. Pick other exercises from the library for the same muscles.` : null,
      day.otherDays?.length ? `The rest of the week stays as it is — don't overload the muscles it already trains: ${day.otherDays.join(' | ')}` : null,
      'Return only that one day, in the "day" object.'
    ] : [])
  ].filter(v => v != null);
  return lines.join('\n');
};

// Backstop for what the strict schema can't express (non-empty days and
// names) and for the json_object fallback, which guarantees nothing beyond
// valid JSON — a malformed response surfaces as a clean retry prompt instead
// of breaking the editor client-side.
const MIN_EXERCISES_PER_DAY = 3;
const VALID_TYPES = new Set(['strength', 'cardio', 'timed']);
const validateDraft = (draft) => {
  if (!draft || !Array.isArray(draft.days) || draft.days.length === 0) return false;
  return draft.days.every(day =>
    day && typeof day.planName === 'string' && day.planName.trim() &&
    Array.isArray(day.exercises) && day.exercises.length > 0 &&
    day.exercises.every(ex => ex && typeof ex.name === 'string' && ex.name.trim() && VALID_TYPES.has(ex.type))
  );
};

// Maps every exercise onto the catalog (taking its library spelling) and
// drops what can't be matched or repeats within the day. Without a catalog
// (an older cached client bundle) the day passes through untouched. Returns
// null when nothing in the day survives, so the caller reports a retry.
const repairDay = (day, catalog) => {
  if (catalog.length === 0) return day;
  const seen = new Set();
  const exercises = [];
  for (const ex of day.exercises) {
    const record = matchCatalogExercise(ex.name, catalog);
    if (!record) {
      console.warn('generate-workout-draft: dropped non-library exercise:', ex.name);
      continue;
    }
    const key = exerciseNameKey(record.name);
    if (seen.has(key)) continue;
    seen.add(key);
    exercises.push({ ...ex, name: record.name });
  }
  return exercises.length > 0 ? { ...day, exercises } : null;
};

// Groq's free plan allows ~8K tokens a minute and ~200K a day for this
// model; one draft is ~3K tokens, so two coaches pressing Generate in the
// same minute used to get a raw "Rate limit reached" error. A 429 says how
// long to wait ("Please try again in 1.11s", or "2m3.5s", plus a
// retry-after header) — a per-minute wait is short, so it's slept off here
// and retried, up to MAX_RATE_LIMIT_WAIT_MS in total. The daily cap's wait
// is hours, so that one fails straight away with a message the coach can act on.
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_MS = 20000;

export const rateLimitWaitMs = (message, retryAfterHeader) => {
  const m = String(message || '').match(/try again in\s+(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?(?:([\d.]+)ms)?/i);
  if (m && (m[1] || m[2] || m[3] || m[4])) {
    const ms = (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) * 1000 + Number(m[4] || 0);
    return Math.ceil(ms) + 250;
  }
  const header = Number(retryAfterHeader);
  return Number.isFinite(header) && header > 0 ? header * 1000 + 250 : null;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Usage logging: one line per generation (one request to this endpoint, which
// may make several Groq calls — retries, top-up days), so the free-tier budget
// can be watched in the Vercel logs. Groq's rate-limit headers give requests
// left TODAY (x-ratelimit-*-requests is the daily RPD window) but tokens left
// only for the current MINUTE (x-ratelimit-*-tokens is the TPM window) — it
// does not expose tokens left today, so that number isn't logged. Never log
// client data here: counts and headers only.
export const newUsage = (mode) => ({
  mode,
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  requestsLeftToday: null,
  requestsLimitToday: null,
  tokensLeftThisMinute: null,
  dailyLimitHit: false
});

export const recordUsage = (usage, data, headers) => {
  if (!usage) return;
  usage.calls += 1;
  const u = data?.usage;
  if (u) {
    usage.promptTokens += Number(u.prompt_tokens) || 0;
    usage.completionTokens += Number(u.completion_tokens) || 0;
    usage.totalTokens += Number(u.total_tokens) || 0;
  }
  const num = (name) => {
    const v = headers?.get?.(name);
    return v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
  };
  usage.requestsLeftToday = num('x-ratelimit-remaining-requests') ?? usage.requestsLeftToday;
  usage.requestsLimitToday = num('x-ratelimit-limit-requests') ?? usage.requestsLimitToday;
  usage.tokensLeftThisMinute = num('x-ratelimit-remaining-tokens') ?? usage.tokensLeftThisMinute;
};

export const formatUsageLine = (u) => [
  'generate-workout-draft usage:',
  `mode=${u.mode}`,
  `calls=${u.calls}`,
  `prompt_tokens=${u.promptTokens}`,
  `completion_tokens=${u.completionTokens}`,
  `total_tokens=${u.totalTokens}`,
  `requests_left_today=${u.requestsLeftToday ?? '?'}/${u.requestsLimitToday ?? '?'}`,
  `tokens_left_this_minute=${u.tokensLeftThisMinute ?? '?'}`,
  ...(u.format ? [`format=${u.format}`] : []),
  ...(u.dailyLimitHit ? ['DAILY_LIMIT_HIT'] : [])
].join(' ');

// `budget` holds the rate-limit wait already spent; by default each call gets
// its own MAX_RATE_LIMIT_WAIT_MS, but "regenerate one day" passes one budget
// to its first call and its overlap retry so the retry never adds a second
// round of waiting.
const callGroq = async (apiKey, payload, usage = null, budget = { waitedMs: 0 }) => {
  for (let attempt = 0; ; attempt += 1) {
    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => ({}));
    recordUsage(usage, data, resp.headers);
    if (resp.status !== 429) return { resp, data };

    const message = data?.error?.message || '';
    const wait = rateLimitWaitMs(message, resp.headers.get('retry-after'));
    const daily = /per day|\bTPD\b|\bRPD\b/i.test(message);
    if (daily) {
      if (usage) usage.dailyLimitHit = true;
      console.warn(`generate-workout-draft: WARNING — Groq DAILY limit reached for ${GROQ_MODEL}. AI drafts will fail for every coach until it resets${wait ? ` (in about ${Math.round(wait / 60000)} min)` : ''}.`);
    }
    if (daily || attempt >= MAX_RATE_LIMIT_RETRIES || wait == null || budget.waitedMs + wait > MAX_RATE_LIMIT_WAIT_MS) {
      console.warn('generate-workout-draft: Groq rate limit, giving up:', message);
      return {
        resp,
        data,
        friendlyError: daily
          ? "Today's AI limit has been reached. Please try again tomorrow, or build this plan manually."
          : 'The AI is busy right now. Please wait a minute and press Generate again.'
      };
    }
    console.warn(`generate-workout-draft: Groq rate limit, retrying in ${wait}ms`);
    budget.waitedMs += wait;
    await sleep(wait);
  }
};

// A failed draft's structure without its text (day count, exercise counts,
// keys) — enough to see what went wrong without logging anything the model
// wrote about the client.
export const describeShape = (parsed) => {
  if (!parsed || typeof parsed !== 'object') return `type=${typeof parsed}`;
  const days = Array.isArray(parsed.days) ? parsed.days : (parsed.day ? [parsed.day] : null);
  if (!days) return `keys=${Object.keys(parsed).join(',')}`;
  return `days=${days.length} exercises=[${days.map(d => (Array.isArray(d?.exercises) ? d.exercises.length : 'none')).join(',')}]`
    + ` types=[${[...new Set(days.flatMap(d => (Array.isArray(d?.exercises) ? d.exercises.map(e => e?.type) : [])))].join(',')}]`;
};

// How many of a regenerated day's exercises were already in the day it
// replaces (by library name key), and that as a share of the new day.
export const countOverlap = (exercises, currentNames) => {
  const current = new Set((currentNames || []).map(exerciseNameKey).filter(Boolean));
  return (exercises || []).filter(e => current.has(exerciseNameKey(e?.name))).length;
};
export const overlapRatio = (exercises, currentNames) =>
  ((exercises || []).length ? countOverlap(exercises, currentNames) / exercises.length : 0);

const sanitizeCatalog = (raw) => (Array.isArray(raw) ? raw : [])
  .filter(e => e && typeof e.name === 'string' && e.name.trim())
  .slice(0, 1500)
  .map(e => ({
    name: e.name.trim().slice(0, 120),
    muscle: String(e.muscle || 'Other').slice(0, 60),
    // Newer clients send the picker category (Chest, Back, Legs …) and the
    // prompt groups by it; an older cached client sends none, and
    // formatCatalogForPrompt falls back to grouping by muscle.
    ...(typeof e.category === 'string' && e.category.trim() ? { category: e.category.trim().slice(0, 40) } : {})
  }));

// The brief, computed here from the request — a brief the browser sends is
// never read. Injury areas: the coach's ticks when the request has them (an
// empty list means "none"); an older client sends only the free text, which
// is matched to areas. Level: the saved experience, then library_level, then
// the coach's pick (`level`, or an older client's Difficulty chip). No level
// at all → no brief (previous behaviour).
export function briefFromRequest(body, catalog) {
  const client = body?.client || {};
  const options = body?.options || {};
  const ticked = Array.isArray(client.injuryAreas)
    ? client.injuryAreas.filter(a => typeof a === 'string' && INJURY_AREAS[a])
    : null;
  return buildProgrammingBrief({
    profile: {
      age: client.age,
      heightCm: client.height,
      weightKg: client.weight,
      sex: client.sex || client.gender,
      goal: client.goal,
      experience: client.experienceLevel,
      libraryLevel: client.libraryLevel
    },
    options: {
      days: options.trainingDays,
      equipment: typeof client.equipment === 'string' ? client.equipment : '',
      liftSafetyCaps: options.liftSafetyCaps === true,
      injuryText: typeof client.injuries === 'string' ? client.injuries : ''
    },
    level: (typeof body?.level === 'string' && body.level) || options.difficulty || null,
    injuryAreas: ticked ?? matchInjuryAreas(client.injuries),
    catalog
  });
}

const note = (kind, text, day = null) => ({ kind, text, ...(day ? { day } : {}) });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing GROQ_API_KEY' });
  }

  const { client, instructions, options, mode, day } = req.body || {};
  const catalog = sanitizeCatalog(req.body?.catalog);
  const dayMode = mode === 'day';
  if (dayMode && !day?.dayLabel) {
    return res.status(400).json({ error: 'Missing the day to regenerate.' });
  }
  if (!client || (!dayMode && !instructions?.trim() && !options?.split && !options?.trainingDays)) {
    return res.status(400).json({ error: 'Missing client profile and at least instructions or an advanced option.' });
  }

  // The coach picked N training days and gets exactly N: extra days are cut,
  // and missing days (or days left with a stub of exercises after the library
  // repair) are generated one at a time and slotted in, so a short draft is
  // completed rather than handed over looking finished.
  const wantDays = dayMode ? 1 : Math.min(7, Math.max(0, Math.round(Number(options?.trainingDays)) || 0));
  const isWeak = (d) => !d || d.exercises.length < MIN_EXERCISES_PER_DAY;

  const { brief, allowedCatalog, excluded, preferred, warnings: briefWarnings } = briefFromRequest(req.body, catalog);
  // The model only ever sees what this client may do.
  const promptCatalog = brief && catalog.length ? allowedCatalog : catalog;
  const profileNotes = brief ? briefWarnings.map(w => note('profile', w)) : [];
  // Holds a day to the brief (or, with no brief, the old library repair).
  const checkDay = (d, dayLabel) => {
    if (!brief) return { day: repairDay(d, catalog), warnings: [] };
    const r = checkDraftDay(d, { brief, catalog, excluded, dayLabel: dayLabel || d.dayLabel });
    return { day: r.day, warnings: r.warnings };
  };
  // Adds the brief summary + warnings to a response body; leaves an older
  // client's (no brief) body exactly as it was.
  const withBrief = (body, notes) => (brief
    ? { ...body, brief: briefSummary(brief, excluded), warnings: [...profileNotes, ...notes] }
    : body);
  const usage = newUsage(dayMode ? 'day' : 'full');
  usage.format = 'json_schema';
  // Strict schema until Groq rejects it once; then plain JSON mode for the
  // rest of this request (every call here uses the same schemas).
  let strict = true;

  // A one-day call's notes carry the label the day will be shown under.
  let dayLabelFor = null;

  // One model call, parsed + validated + repaired. Resolves to
  // { fatal } (don't retry), { failure } (retry) or { summary, days }.
  const askModel = async (isDay, user, { temperature = TEMPERATURE_FULL, budget } = {}) => {
    const payload = (useStrict) => ({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(promptCatalog, isDay ? 'day' : 'full', brief, preferred) },
        { role: 'user', content: user }
      ],
      response_format: responseFormatFor(isDay, useStrict),
      temperature
    });
    let { resp, data, friendlyError } = await callGroq(apiKey, payload(strict), usage, budget);
    if (strict && resp.status === 400) {
      strict = false;
      usage.format = 'json_object_fallback';
      console.warn(`generate-workout-draft: FALLBACK — Groq rejected the strict json_schema (400 ${data?.error?.code || ''} ${data?.error?.message || ''}); retrying with json_object for the rest of this request.`);
      ({ resp, data, friendlyError } = await callGroq(apiKey, payload(false), usage, budget));
    }
    if (!resp.ok) {
      // Status + Groq's own error text only: a failed_generation field can
      // carry model output that echoes the client profile.
      console.error('generate-workout-draft: Groq error:', resp.status, data?.error?.code || '', data?.error?.message || '');
      return { fatal: { status: friendlyError ? 429 : 502, error: friendlyError || data?.error?.message || 'Failed to generate workout draft.' } };
    }
    const rawText = data?.choices?.[0]?.message?.content;
    if (!rawText) return { failure: 'The AI did not return a usable draft. Please try again.' };
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('generate-workout-draft: JSON parse failed:', parseErr.message, `(${rawText.length} chars)`);
      return { failure: 'The AI returned an unreadable draft. Please try again.' };
    }
    // One day comes back as { day } — checked by the same validator as a
    // one-day draft.
    const draft = isDay ? { days: parsed?.day ? [parsed.day] : [] } : parsed;
    if (!validateDraft(draft)) {
      console.error('generate-workout-draft: draft failed validation:', describeShape(parsed));
      return { failure: 'The AI returned an incomplete draft. Please try again.' };
    }
    const checked = draft.days.map(d => checkDay(d, isDay ? dayLabelFor : null));
    return {
      summary: draft.programSummary,
      days: checked.map(c => c.day),
      dayWarnings: checked.map(c => c.warnings),
      raw: draft.days
    };
  };

  const baseUser = (dayArg) => buildUserPrompt({ client, instructions: instructions || '', options: options || {}, day: dayArg, brief });
  const describeDay = (d) => `${d.dayLabel}${d.focus ? ` (${d.focus})` : ''}: ${d.exercises.map(e => e.name).join(', ')}`;

  try {
    if (dayMode) {
      // "Regenerate this day" must come back different. A version that
      // repeats more than half of the current exercises gets ONE retry with
      // those names as a do-not-use list — never a further call after it —
      // sharing one rate-limit wait budget with the first call. If the retry
      // fails or still repeats more, the better of the two is returned
      // rather than an error.
      const opts = { temperature: TEMPERATURE_REGENERATE_DAY, budget: { waitedMs: 0 } };
      const current = day.currentExercises || [];
      dayLabelFor = day.dayLabel;
      // got = { d: the checked day, w: its warnings }
      const send = (got) => res.status(200).json(withBrief(
        { day: { ...got.d, dayLabel: day.dayLabel } },
        got.w.map(t => note('day', t, day.dayLabel))
      ));
      let failure = null;
      let repeated = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const r = await askModel(true, baseUser(repeated ? { ...day, doNotUse: current } : day), opts);
        if (r.fatal) {
          if (repeated) return send(repeated);
          return res.status(r.fatal.status).json({ error: r.fatal.error });
        }
        const got = r.failure ? null : { d: r.days[0], w: r.dayWarnings[0] };
        if (!got || isWeak(got.d)) {
          failure = r.failure || 'The AI picked too few exercises from your library for that day. Please try again.';
          if (repeated) return send(repeated);
          continue;
        }
        if (repeated) {
          return send(overlapRatio(got.d.exercises, current) < overlapRatio(repeated.d.exercises, current) ? got : repeated);
        }
        if (overlapRatio(got.d.exercises, current) > 0.5 && attempt < 2) {
          console.warn(`generate-workout-draft: regenerated day repeated ${countOverlap(got.d.exercises, current)}/${got.d.exercises.length} current exercises — retrying once with a do-not-use list.`);
          repeated = got;
          continue;
        }
        return send(got);
      }
      return res.status(502).json({ error: failure || 'Failed to generate workout draft.' });
    }

    const fullUser = baseUser(null)
      + (wantDays ? `

The "days" array MUST contain exactly ${wantDays} training days — no more, no fewer — each with ${perDayText(brief)} exercises.` : '');
    const goodCount = (days) => days.filter(d => !isWeak(d)).length;
    let best = null;
    let failure = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const r = await askModel(false, fullUser);
      if (r.fatal) return res.status(r.fatal.status).json({ error: r.fatal.error });
      if (r.failure) { failure = r.failure; continue; }
      const take = (list) => (wantDays ? list.slice(0, wantDays) : list);
      const cut = take(r.days);
      if (!best || goodCount(cut) > goodCount(best.days)) {
        best = { summary: r.summary, days: cut, raw: take(r.raw), dayWarnings: take(r.dayWarnings) };
      }
      if (goodCount(cut) === (wantDays || cut.length)) break;
    }
    if (!best) return res.status(502).json({ error: failure || 'Failed to generate workout draft.' });

    // Top up: fill each missing / stub day on its own, held to the same brief.
    const days = [...best.days];
    const dayWarnings = [...best.dayWarnings];
    for (let i = 0; i < (wantDays || 0); i += 1) {
      if (!isWeak(days[i])) continue;
      const label = best.raw[i]?.dayLabel || `Day ${i + 1}`;
      const focus = best.raw[i]?.focus || 'a focus that complements the other days of the week';
      const otherDays = days.filter((d, j) => j !== i && !isWeak(d)).map(describeDay);
      dayLabelFor = label;
      let filled = null;
      for (let attempt = 0; attempt < 3 && !filled; attempt += 1) {
        const r = await askModel(true, baseUser({ dayLabel: label, focus, currentExercises: [], otherDays }));
        if (r.fatal) return res.status(r.fatal.status).json({ error: r.fatal.error });
        if (!r.failure && !isWeak(r.days[0])) {
          filled = { ...r.days[0], dayLabel: label };
          dayWarnings[i] = r.dayWarnings[0];
        }
      }
      if (!filled) {
        console.error(`generate-workout-draft: could not complete day ${i + 1} of ${wantDays}`);
        return res.status(502).json({ error: `The AI could not complete all ${wantDays} days. Please try again.` });
      }
      days[i] = filled;
    }
    if (days.some(isWeak)) return res.status(502).json({ error: 'The AI picked too few exercises from your library. Please try again.' });
    // Weekly sets per muscle over the cap: a warning, never another call.
    const notes = [
      ...days.flatMap((d, i) => (dayWarnings[i] || []).map(t => note('day', t, d.dayLabel))),
      ...weeklySetWarnings(days, brief, catalog).map(t => note('week', t))
    ];
    return res.status(200).json(withBrief({ draft: { programSummary: best.summary, days } }, notes));
  } catch (err) {
    console.error('generate-workout-draft error:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Failed to generate workout draft.' });
  } finally {
    const line = formatUsageLine(usage);
    if (usage.dailyLimitHit) console.warn(line);
    else console.log(line);
  }
}
