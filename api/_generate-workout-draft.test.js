import { describe, it, expect, vi, afterEach } from 'vitest';
import handler, {
  rateLimitWaitMs, newUsage, recordUsage, formatUsageLine, describeShape,
  DRAFT_SCHEMA, DAY_RESPONSE_SCHEMA, responseFormatFor, overlapRatio, countOverlap,
  TEMPERATURE_FULL, TEMPERATURE_REGENERATE_DAY, isGenerationFailure, REASONING_EFFORT
} from './generate-workout-draft.js';

describe('rateLimitWaitMs', () => {
  it('reads the wait out of Groq\'s 429 message', () => {
    const msg = 'Rate limit reached for model `openai/gpt-oss-120b` ... on tokens per minute (TPM): Limit 8000, Used 5980, Requested 2168. Please try again in 1.109999999s. Need more tokens?';
    expect(rateLimitWaitMs(msg)).toBe(1360);
  });

  it('handles minutes and milliseconds', () => {
    expect(rateLimitWaitMs('Please try again in 2m3.5s.')).toBe(123750);
    expect(rateLimitWaitMs('Please try again in 450ms.')).toBe(700);
  });

  it('falls back to the retry-after header, else null', () => {
    expect(rateLimitWaitMs('Rate limit reached', '3')).toBe(3250);
    expect(rateLimitWaitMs('Rate limit reached', null)).toBeNull();
  });
});

// ── Test harness: a fake Groq behind global fetch ──────────────────────────

const CLIENT = { name: 'Zelda Secretname', age: 34, weight: 72, goal: 'Fat Loss', injuries: 'Left knee pain' };
const CATALOG = [
  ['Bench Press (Barbell)', 'Chest', 'Chest'], ['Incline Dumbbell Press', 'Chest', 'Chest'], ['Cable Fly', 'Chest', 'Chest'],
  ['Push Up', 'Chest', 'Chest'], ['Pec Deck Fly', 'Chest', 'Chest'],
  ['Barbell Row', 'Back / Lats', 'Back'], ['Lat Pulldown (Close Grip)', 'Latissimus Dorsi', 'Back'], ['Seated Cable Row', 'Back / Lats', 'Back'],
  ['Barbell Squat', 'Quadriceps', 'Legs'], ['Leg Press', 'Quadriceps', 'Legs'], ['Romanian Deadlift', 'Hamstrings', 'Legs'],
  ['Lateral Raise', 'Side Delts', 'Shoulders'], ['Plank', 'Core / Abs', 'Core']
].map(([name, muscle, category]) => ({ name, muscle, category }));

const ex = (name, type = 'strength') => ({ name, type, setCount: 3, reps: 10, durationMinutes: null, notes: null });
const day = (label, names) => ({ dayLabel: label, focus: 'Push', planName: `${label} plan`, exercises: names.map(n => ex(n)) });

const groqHeaders = { 'x-ratelimit-remaining-requests': '987', 'x-ratelimit-limit-requests': '1000', 'x-ratelimit-remaining-tokens': '4321' };
const okReply = (content, usage = { prompt_tokens: 3000, completion_tokens: 900, total_tokens: 3900 }) => ({
  status: 200, body: { choices: [{ message: { content: JSON.stringify(content) } }], usage }, headers: groqHeaders
});

// Queues replies; records every request body. An unqueued call fails the test.
const fakeGroq = (replies) => {
  const requests = [];
  const queue = [...replies];
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    requests.push(JSON.parse(init.body));
    const r = queue.shift();
    if (!r) throw new Error('unexpected extra Groq call');
    return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers || {} });
  }));
  return requests;
};

const call = (body) => new Promise((resolve) => {
  const res = {
    statusCode: 200,
    setHeader() {},
    status(c) { this.statusCode = c; return this; },
    json(o) { resolve({ status: this.statusCode, body: o }); },
    end() { resolve({ status: this.statusCode }); }
  };
  handler({ method: 'POST', body }, res);
});

const captureLogs = () => {
  const lines = [];
  for (const level of ['log', 'warn', 'error']) {
    vi.spyOn(console, level).mockImplementation((...args) => lines.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')));
  }
  return lines;
};

// The usage line is written in the handler's finally, just after the
// response — let it run before reading the logs.
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GROQ_API_KEY;
});

describe('usage logging', () => {
  it('tallies tokens across calls and keeps the latest rate-limit headers', () => {
    const u = newUsage('full');
    recordUsage(u, { usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }, new Headers({ 'x-ratelimit-remaining-requests': '10', 'x-ratelimit-limit-requests': '1000' }));
    recordUsage(u, { usage: { prompt_tokens: 50, completion_tokens: 5, total_tokens: 55 } }, new Headers({ 'x-ratelimit-remaining-requests': '9', 'x-ratelimit-remaining-tokens': '700' }));
    expect(u).toMatchObject({ calls: 2, promptTokens: 150, completionTokens: 25, totalTokens: 175, requestsLeftToday: 9, requestsLimitToday: 1000, tokensLeftThisMinute: 700 });
    expect(formatUsageLine(u)).toBe('generate-workout-draft usage: mode=full calls=2 prompt_tokens=150 completion_tokens=25 total_tokens=175 requests_left_today=9/1000 tokens_left_this_minute=700');
  });

  it('describes a failed draft by shape only', () => {
    expect(describeShape({ programSummary: 'For Zelda', days: [{ exercises: [ex('A'), ex('B', 'cardio')] }, { exercises: 'x' }] }))
      .toBe('days=2 exercises=[2,none] types=[strength,cardio]');
    expect(describeShape(null)).toBe('type=object');
  });

  it('logs exactly one usage line per generation, with no client data in any log line', async () => {
    process.env.GROQ_API_KEY = 'test';
    const logs = captureLogs();
    fakeGroq([okReply({ programSummary: 'Plan for Zelda Secretname, knee-friendly', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Leg Press', 'Not In Library'])] })]);
    const r = await call({ client: CLIENT, instructions: 'Push day', options: { trainingDays: 1 }, catalog: CATALOG });
    await settle();
    expect(r.status).toBe(200);
    const usageLines = logs.filter(l => l.includes('usage:'));
    expect(usageLines).toHaveLength(1);
    expect(usageLines[0]).toMatch(/mode=full calls=1 prompt_tokens=3000 completion_tokens=900 total_tokens=3900 requests_left_today=987\/1000 tokens_left_this_minute=4321 format=json_schema$/);
    expect(logs.join('\n')).not.toMatch(/Zelda|Secretname|knee/i);
  });

  it('warns loudly when the daily limit is hit, and still logs the usage line', async () => {
    process.env.GROQ_API_KEY = 'test';
    const logs = captureLogs();
    fakeGroq([{ status: 429, body: { error: { message: 'Rate limit reached for model `openai/gpt-oss-120b` on tokens per day (TPD): Limit 200000. Please try again in 7m12s.' } }, headers: groqHeaders }]);
    const r = await call({ client: CLIENT, instructions: 'Push day', options: { trainingDays: 1 }, catalog: CATALOG });
    await settle();
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/Today's AI limit/);
    expect(logs.some(l => /WARNING — Groq DAILY limit reached/.test(l))).toBe(true);
    expect(logs.find(l => l.includes('usage:'))).toMatch(/DAILY_LIMIT_HIT/);
  });
});

// Every object in a strict schema must list all its properties as required
// and forbid extra ones — Groq rejects the schema otherwise.
const assertStrict = (schema, path = '$') => {
  const types = [].concat(schema.type);
  if (types.includes('object')) {
    expect(schema.additionalProperties, `${path} additionalProperties`).toBe(false);
    expect([...schema.required].sort(), `${path} required`).toEqual(Object.keys(schema.properties).sort());
    Object.entries(schema.properties).forEach(([k, v]) => assertStrict(v, `${path}.${k}`));
  }
  if (types.includes('array')) assertStrict(schema.items, `${path}[]`);
};

describe('strict json_schema', () => {
  it('both schemas are valid strict schemas, with nullable optional fields', () => {
    assertStrict(DRAFT_SCHEMA);
    assertStrict(DAY_RESPONSE_SCHEMA);
    const exercise = DRAFT_SCHEMA.properties.days.items.properties.exercises.items;
    expect(exercise.properties.type.enum).toEqual(['strength', 'cardio', 'timed']);
    expect(exercise.properties.reps.type).toEqual(['integer', 'null']);
    expect(exercise.properties.durationMinutes.type).toEqual(['number', 'null']);
    expect(exercise.properties.notes.type).toEqual(['string', 'null']);
  });

  it('builds the response_format for each mode, and the json_object fallback', () => {
    expect(responseFormatFor(false)).toEqual({ type: 'json_schema', json_schema: { name: 'workout_draft', strict: true, schema: DRAFT_SCHEMA } });
    expect(responseFormatFor(true).json_schema).toMatchObject({ name: 'workout_day', strict: true, schema: DAY_RESPONSE_SCHEMA });
    expect(responseFormatFor(true, false)).toEqual({ type: 'json_object' });
  });

  it('a full draft asks for the strict schema at the full-draft temperature, and returns the same shape as before', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    const requests = fakeGroq([okReply({ programSummary: 'S', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Leg Press'])] })]);
    const r = await call({ client: CLIENT, instructions: 'Push day', options: { trainingDays: 1 }, catalog: CATALOG });
    expect(requests).toHaveLength(1);
    expect(requests[0].response_format).toEqual(responseFormatFor(false));
    expect(requests[0].temperature).toBe(TEMPERATURE_FULL);
    expect(requests[0].reasoning_effort).toBe(REASONING_EFFORT);
    expect(REASONING_EFFORT).toBe('low');
    expect(TEMPERATURE_FULL).toBe(0.4);
    expect(r).toEqual({
      status: 200,
      body: { draft: { programSummary: 'S', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Leg Press'])] } }
    });
  });

  it('falls back to json_object when Groq rejects the schema, logs it, and keeps json_object for later calls', async () => {
    process.env.GROQ_API_KEY = 'test';
    const logs = captureLogs();
    const requests = fakeGroq([
      { status: 400, body: { error: { code: 'invalid_request_error', message: 'response_format json_schema is not supported' } }, headers: groqHeaders },
      // Two days wanted, only one returned (twice — a short draft is asked
      // for again once): the top-up call must also use json_object.
      okReply({ programSummary: 'S', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Leg Press'])] }),
      okReply({ programSummary: 'S', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Leg Press'])] }),
      okReply({ day: day('Day 2', ['Barbell Squat', 'Romanian Deadlift', 'Plank']) })
    ]);
    const r = await call({ client: CLIENT, instructions: 'Two days', options: { trainingDays: 2 }, catalog: CATALOG });
    await settle();
    expect(r.status).toBe(200);
    expect(r.body.draft.days.map(d => d.dayLabel)).toEqual(['Day 1', 'Day 2']);
    expect(requests.map(q => q.response_format.type)).toEqual(['json_schema', 'json_object', 'json_object', 'json_object']);
    expect(logs.filter(l => /FALLBACK — Groq rejected the strict json_schema/.test(l))).toHaveLength(1);
    expect(logs.find(l => l.includes('usage:'))).toMatch(/calls=4 .*format=json_object_fallback/);
  });

  it('accepts null reps / durationMinutes / notes from the schema', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    fakeGroq([okReply({ programSummary: 'S', days: [{ dayLabel: 'Day 1', focus: 'Mixed', planName: 'P', exercises: [
      ex('Bench Press (Barbell)'), ex('Leg Press'), { name: 'Plank', type: 'timed', setCount: 3, reps: null, durationMinutes: 0.5, notes: null }
    ] }] })]);
    const r = await call({ client: CLIENT, instructions: 'x', options: { trainingDays: 1 }, catalog: CATALOG });
    expect(r.status).toBe(200);
    expect(r.body.draft.days[0].exercises[2]).toEqual({ name: 'Plank', type: 'timed', setCount: 3, reps: null, durationMinutes: 0.5, notes: null });
  });
});

describe('regenerate one day', () => {
  const CURRENT = ['Bench Press (Barbell)', 'Incline Dumbbell Press', 'Cable Fly', 'Lateral Raise'];
  const body = { client: CLIENT, instructions: 'Push', options: {}, catalog: CATALOG, mode: 'day', day: { dayLabel: 'Monday', focus: 'Push', currentExercises: CURRENT, otherDays: [] } };
  const dayReply = (names) => okReply({ day: day('Monday', names) });

  it('measures overlap by library name key', () => {
    const exs = ['bench press (barbell)', 'Push Up', 'Cable Flys'].map(n => ex(n));
    expect(countOverlap(exs, CURRENT)).toBe(2);
    expect(overlapRatio(exs, CURRENT)).toBeCloseTo(2 / 3);
    expect(overlapRatio([], CURRENT)).toBe(0);
  });

  it('a different enough day is returned after one call, at the regenerate temperature', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    const requests = fakeGroq([dayReply(['Push Up', 'Pec Deck Fly', 'Cable Fly', 'Lateral Raise'])]); // 2/4 = half, not more
    const r = await call(body);
    expect(requests).toHaveLength(1);
    expect(requests[0].temperature).toBe(TEMPERATURE_REGENERATE_DAY);
    expect(TEMPERATURE_REGENERATE_DAY).toBe(0.7);
    expect(requests[0].response_format).toEqual(responseFormatFor(true));
    expect(r.status).toBe(200);
    expect(Object.keys(r.body)).toEqual(['day']);
    expect(r.body.day.exercises.map(e => e.name)).toEqual(['Push Up', 'Pec Deck Fly', 'Cable Fly', 'Lateral Raise']);
  });

  it('a repeated day gets ONE retry with the current names as a do-not-use list', async () => {
    process.env.GROQ_API_KEY = 'test';
    const logs = captureLogs();
    const requests = fakeGroq([
      dayReply(['Bench Press (Barbell)', 'Incline Dumbbell Press', 'Cable Fly', 'Push Up']), // 3/4 repeated
      dayReply(['Push Up', 'Pec Deck Fly', 'Lateral Raise', 'Plank'])
    ]);
    const r = await call(body);
    expect(requests).toHaveLength(2);
    expect(requests[0].messages[1].content).not.toMatch(/DO NOT USE/);
    expect(requests[1].messages[1].content).toMatch(/DO NOT USE any of these exercises[^\n]*Bench Press \(Barbell\), Incline Dumbbell Press, Cable Fly, Lateral Raise/);
    expect(requests[1].temperature).toBe(TEMPERATURE_REGENERATE_DAY);
    expect(r.body.day.exercises.map(e => e.name)).toEqual(['Push Up', 'Pec Deck Fly', 'Lateral Raise', 'Plank']);
    expect(logs.some(l => /repeated 3\/4 current exercises — retrying once/.test(l))).toBe(true);
  });

  it('never makes a third call: if the retry still repeats, the less repetitive version wins', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    fakeGroq([
      dayReply(['Bench Press (Barbell)', 'Incline Dumbbell Press', 'Cable Fly', 'Lateral Raise']), // 4/4
      dayReply(['Bench Press (Barbell)', 'Incline Dumbbell Press', 'Cable Fly', 'Push Up']) // 3/4
    ]); // a third call would throw
    const r = await call(body);
    expect(r.status).toBe(200);
    expect(r.body.day.exercises.map(e => e.name)).toContain('Push Up');
  });

  it('if the retry fails, the first (repeated) version is returned rather than an error', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    fakeGroq([
      dayReply(['Bench Press (Barbell)', 'Incline Dumbbell Press', 'Cable Fly', 'Lateral Raise']),
      { status: 200, body: { choices: [{ message: { content: 'not json' } }] }, headers: groqHeaders }
    ]);
    const r = await call(body);
    expect(r.status).toBe(200);
    expect(r.body.day.exercises).toHaveLength(4);
  });

  it('the retry shares the first call\'s rate-limit wait budget', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    vi.useFakeTimers();
    const limited = { status: 429, body: { error: { message: 'Rate limit reached on tokens per minute (TPM). Please try again in 12s.' } }, headers: groqHeaders };
    const requests = fakeGroq([
      limited,
      dayReply(['Bench Press (Barbell)', 'Incline Dumbbell Press', 'Cable Fly', 'Lateral Raise']), // repeated -> retry
      limited // 12s of the 20s budget already spent: no second wait, the repeated day is returned
    ]);
    const pending = call(body);
    await vi.advanceTimersByTimeAsync(13000);
    const r = await pending;
    vi.useRealTimers();
    expect(requests).toHaveLength(3);
    expect(r.status).toBe(200);
    expect(r.body.day.exercises.map(e => e.name)).toEqual(CURRENT);
  });
});

describe('catalog in the prompt', () => {
  it('groups by category, falling back to muscle for an older client that sends none', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    const requests = fakeGroq([okReply({ programSummary: 'S', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Leg Press'])] })]);
    await call({
      client: CLIENT, instructions: 'x', options: { trainingDays: 1 },
      catalog: [
        { name: 'Bench Press (Barbell)', muscle: 'Pectoralis Major', category: 'Chest' },
        { name: 'Barbell Row', muscle: 'Back / Lats', category: 'Back' },
        { name: 'Seated Cable Row', muscle: 'Latissimus Dorsi', category: 'Back' },
        { name: 'Leg Press', muscle: 'Quadriceps' } // no category: old cached client
      ]
    });
    const system = requests[0].messages[0].content;
    expect(system).toMatch(/^Back: Barbell Row; Seated Cable Row$/m);
    expect(system).toMatch(/^Chest: Bench Press \(Barbell\)$/m);
    expect(system).toMatch(/^Quadriceps: Leg Press$/m);
    expect(system).not.toMatch(/Latissimus Dorsi:/);
  });
});

// ── Programming brief (Part 3) ─────────────────────────────────────────────

describe('programming brief', () => {
  const BRIEF_CLIENT = { name: 'Zelda Secretname', age: 34, height: 170, weight: 65, sex: 'female', goal: 'Muscle Building', injuries: 'Left knee pain', injuryAreas: ['knee'] };
  const body = (extra = {}) => ({ client: BRIEF_CLIENT, level: 'intermediate', instructions: 'Upper/lower', options: { trainingDays: 1 }, catalog: CATALOG, ...extra });
  const strength = (name, setCount, reps) => ({ name, type: 'strength', setCount, reps, durationMinutes: null, notes: null });

  it('puts the brief in the system prompt, sends only the allowed catalog, and never the client name', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    const requests = fakeGroq([okReply({ programSummary: 'S', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Seated Cable Row'])] })]);
    await call(body());
    const [system, user] = requests[0].messages.map(m => m.content);
    expect(system).toMatch(/CLIENT PROGRAMMING RULES/);
    expect(system).toMatch(/Level: intermediate/);
    expect(system).toMatch(/Sets per exercise: 3\. Reps per set: main compound lifts 8 to 10, accessories 10 to 12/);
    expect(system).toMatch(/Knee injury: exercises that load it are already removed/);
    expect(system).toMatch(/5 to 6 exercises per day/);
    expect(system).not.toMatch(/Use the client's stats/);
    // Knee-loading exercises are not offered at all.
    expect(system).not.toMatch(/Leg Press|Barbell Squat/);
    expect(system).toMatch(/Romanian Deadlift/);
    expect(user).not.toMatch(/Zelda|Secretname/);
    expect(user).toMatch(/Sex: female/);
    expect(user).toMatch(/exactly 1 training days .* each with 5 to 6 exercises/);
  });

  it('removes excluded exercises, clamps sets/reps, and returns the brief summary + warnings beside the draft', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    const requests = fakeGroq([okReply({ programSummary: 'S', days: [{ dayLabel: 'Day 1', focus: 'Mixed', planName: 'P', exercises: [
      strength('Bench Press (Barbell)', 6, 3), // sets → 3, main reps → 8
      strength('Leg Press', 3, 10), // knee: removed
      strength('Seated Cable Row', 3, 10),
      strength('Lateral Raise', 3, 30), // accessory reps → 12
      strength('Plank', 3, 10)
    ] }] })]);
    const r = await call(body());
    expect(requests).toHaveLength(1);
    expect(r.status).toBe(200);
    const exs = r.body.draft.days[0].exercises;
    expect(exs.map(e => e.name)).toEqual(['Bench Press (Barbell)', 'Seated Cable Row', 'Lateral Raise', 'Plank']);
    expect(exs[0]).toMatchObject({ setCount: 3, reps: 8 });
    expect(exs[2]).toMatchObject({ reps: 12 });
    expect(r.body.brief).toMatchObject({ level: 'intermediate', levelSource: 'coachPick', injuries: ['Knee'], impactCap: null, reps: { mainLifts: [8, 10], accessories: [10, 12] } });
    expect(r.body.warnings).toEqual(expect.arrayContaining([
      { kind: 'day', day: 'Day 1', text: 'Day 1: removed Leg Press (knee injury).' },
      { kind: 'day', day: 'Day 1', text: "Day 1: sets/reps adjusted on 2 exercises to fit the client's ranges." }
    ]));
  });

  it('weekly sets over the cap are a warning, not another call', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    const chest = (label) => ({ dayLabel: label, focus: 'Chest', planName: label, exercises: ['Bench Press (Barbell)', 'Incline Dumbbell Press', 'Cable Fly', 'Pec Deck Fly'].map(n => strength(n, 3, 10)) });
    const requests = fakeGroq([okReply({ programSummary: 'S', days: [chest('Day 1'), chest('Day 2')] })]);
    const r = await call(body({ options: { trainingDays: 2 } }));
    expect(requests).toHaveLength(1);
    expect(r.body.warnings).toContainEqual({ kind: 'week', text: 'Chest: 24 sets this week, above the 16-set cap for an intermediate client. Consider trimming one Chest exercise.' });
  });

  it('top-up days are held to the same brief', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    const requests = fakeGroq([
      okReply({ programSummary: 'S', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Seated Cable Row'])] }),
      okReply({ programSummary: 'S', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Seated Cable Row'])] }),
      okReply({ day: day('Day 2', ['Leg Press', 'Romanian Deadlift', 'Plank', 'Lateral Raise', 'Cable Fly']) })
    ]);
    const r = await call(body({ options: { trainingDays: 2 } }));
    expect(requests).toHaveLength(3);
    expect(requests[2].messages[0].content).toMatch(/CLIENT PROGRAMMING RULES/);
    expect(r.body.draft.days[1].exercises.map(e => e.name)).not.toContain('Leg Press');
    expect(r.body.warnings).toContainEqual({ kind: 'day', day: 'Day 2', text: 'Day 2: removed Leg Press (knee injury).' });
  });

  it('regenerate one day uses the brief and returns { day, brief, warnings }', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    const requests = fakeGroq([okReply({ day: day('Monday', ['Leg Press', 'Romanian Deadlift', 'Plank', 'Lateral Raise', 'Cable Fly']) })]);
    const r = await call(body({ mode: 'day', day: { dayLabel: 'Monday', focus: 'Legs', currentExercises: ['Barbell Squat'], otherDays: [] } }));
    expect(requests[0].messages[0].content).toMatch(/CLIENT PROGRAMMING RULES/);
    expect(Object.keys(r.body)).toEqual(['day', 'brief', 'warnings']);
    expect(r.body.day.exercises.map(e => e.name)).toEqual(['Romanian Deadlift', 'Plank', 'Lateral Raise', 'Cable Fly']);
    expect(r.body.warnings).toContainEqual({ kind: 'day', day: 'Monday', text: 'Monday: removed Leg Press (knee injury).' });
  });

  it('never trusts a brief or allowed catalog sent by the browser', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    const requests = fakeGroq([okReply({ programSummary: 'S', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Seated Cable Row'])] })]);
    await call(body({ brief: { level: 'advanced', injuries: [] }, allowedCatalog: CATALOG }));
    const system = requests[0].messages[0].content;
    expect(system).toMatch(/Level: intermediate/);
    expect(system).not.toMatch(/Leg Press/);
  });

  it('an older client with only injury text and a Difficulty chip still gets a brief from the text', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    const requests = fakeGroq([okReply({ programSummary: 'S', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Seated Cable Row'])] })]);
    const r = await call({ client: CLIENT, instructions: 'x', options: { trainingDays: 1, difficulty: 'Intermediate' }, catalog: CATALOG });
    expect(requests[0].messages[0].content).not.toMatch(/Leg Press/);
    expect(r.body.brief.injuries).toEqual(['Knee']);
  });

  it('an older client with no level keeps the old prompt and response shape', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    const requests = fakeGroq([okReply({ programSummary: 'S', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Leg Press'])] })]);
    const r = await call({ client: CLIENT, instructions: 'x', options: { trainingDays: 1 }, catalog: CATALOG });
    expect(requests[0].messages[0].content).toMatch(/Use the client's stats/);
    expect(requests[0].messages[1].content).not.toMatch(/Zelda/);
    expect(Object.keys(r.body)).toEqual(['draft']);
  });
});

describe('Groq generation failures (json_validate_failed)', () => {
  const genFail = (code) => ({ status: 400, body: { error: { code, message: 'Failed to validate JSON. Please adjust your prompt. See \'failed_generation\' for more details.' } }, headers: groqHeaders });

  it('recognises the generation-failure codes only', () => {
    expect(isGenerationFailure({ error: { code: 'json_validate_failed' } })).toBe(true);
    expect(isGenerationFailure({ error: { code: 'json_generate_failed' } })).toBe(true);
    expect(isGenerationFailure({ error: { code: 'invalid_request_error' } })).toBe(false);
    expect(isGenerationFailure(null)).toBe(false);
  });

  it('retries in strict mode instead of switching to json_object', async () => {
    process.env.GROQ_API_KEY = 'test';
    const logs = captureLogs();
    const requests = fakeGroq([
      genFail('json_validate_failed'),
      okReply({ programSummary: 'S', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Seated Cable Row'])] })
    ]);
    const r = await call({ client: CLIENT, instructions: 'x', options: { trainingDays: 1 }, catalog: CATALOG });
    await settle();
    expect(r.status).toBe(200);
    expect(requests.map(q => q.response_format.type)).toEqual(['json_schema', 'json_schema']);
    expect(logs.some(l => /FALLBACK/.test(l))).toBe(false);
    expect(logs.find(l => l.includes('usage:'))).toMatch(/calls=2 .*format=json_schema$/);
  });

  it('never shows Groq\'s "adjust your prompt" text to the coach', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    fakeGroq([genFail('json_validate_failed'), genFail('json_generate_failed')]);
    const r = await call({ client: CLIENT, instructions: 'x', options: { trainingDays: 1 }, catalog: CATALOG });
    expect(r.status).toBe(502);
    expect(r.body.error).toBe('The AI returned an unreadable draft. Please try again.');
  });

  it('the prompt never shows a range with a dash (the model copied it into "reps")', async () => {
    process.env.GROQ_API_KEY = 'test';
    captureLogs();
    const requests = fakeGroq([okReply({ programSummary: 'S', days: [day('Day 1', ['Bench Press (Barbell)', 'Barbell Row', 'Seated Cable Row'])] })]);
    await call({ client: { age: 24, sex: 'male', height: 180, weight: 80, goal: 'Muscle Building' }, level: 'advanced', instructions: 'PPL', options: { trainingDays: 1 }, catalog: CATALOG });
    const rules = requests[0].messages[0].content.split('Other rules:')[0];
    expect(rules).not.toMatch(/\d\s*[–-]\s*\d/);
    expect(rules).toMatch(/"reps" are each ONE whole number/);
  });
});
