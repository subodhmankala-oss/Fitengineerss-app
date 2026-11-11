import { describe, it, expect, vi, afterEach } from 'vitest';
import handler, { rateLimitWaitMs, newUsage, recordUsage, formatUsageLine, describeShape } from './generate-workout-draft.js';

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
    expect(usageLines[0]).toMatch(/mode=full calls=1 prompt_tokens=3000 completion_tokens=900 total_tokens=3900 requests_left_today=987\/1000 tokens_left_this_minute=4321/);
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
