// @vitest-environment jsdom
//
// workout_drafts holds one row per client PER SOURCE — the client's own
// session ('self') and their coach's Live Log ('coach'). Every read, write
// and delete must stay on its own source's row, or one side's save/finish
// wipes the other's in-progress session (the bug this split fixes). See
// sql/supabase_workout_drafts_per_source.sql.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: {}, from: vi.fn(), rpc: vi.fn() })),
}));

const USER = '11111111-2222-3333-4444-555555555555';
const selfRow = { user_id: USER, coach_id: null, source: 'self', plan_name: 'Mine', exercises: [], timer_status: 'idle', pause_intervals: [] };
const coachRow = { user_id: USER, coach_id: 'coach-1', source: 'coach', plan_name: 'Live', exercises: [], timer_status: 'running', pause_intervals: [] };

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

describe('workout draft service — scoped per source', () => {
  let databaseService;
  let calls;
  let restRows;
  let serverResponse;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'placeholder-anon-key');
    localStorage.clear();
    calls = [];
    restRows = [];
    serverResponse = { drafts: [] };
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = decodeURIComponent(String(url));
      calls.push({ url: u, method: opts.method || 'GET' });
      if (u.includes('/api/get-workout-draft')) return json(serverResponse);
      if (u.includes('/rest/v1/workout_drafts') && (opts.method || 'GET') === 'GET') return json(restRows);
      return json([]);
    });
    databaseService = (await import('./databaseService')).default;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const restCalls = () => calls.filter(c => c.url.includes('/rest/v1/workout_drafts'));

  it('upserts on (user_id, source), so a coach save cannot replace the client’s own row', async () => {
    await databaseService.saveWorkoutDraft({ userId: USER, coachId: 'coach-1', source: 'coach', exercises: [] });
    const upsert = restCalls().find(c => c.method === 'POST');
    expect(upsert.url).toContain('on_conflict=user_id,source');
  });

  it('reads only the requested source', async () => {
    restRows = [coachRow];
    const draft = await databaseService.getWorkoutDraft(USER, 'coach');
    expect(restCalls()[0].url).toContain('source=eq.coach');
    expect(draft).toMatchObject({ source: 'coach', coachId: 'coach-1', planName: 'Live' });
  });

  it('falls back to the server read and still picks the right source', async () => {
    restRows = [];
    serverResponse = { drafts: [selfRow, coachRow], draft: selfRow };
    expect(await databaseService.getWorkoutDraft(USER, 'coach')).toMatchObject({ source: 'coach' });
    expect(await databaseService.getWorkoutDraft(USER, 'self')).toMatchObject({ source: 'self' });
  });

  it('returns null rather than the other side’s row when this source has no draft', async () => {
    restRows = [];
    serverResponse = { drafts: [coachRow], draft: coachRow };
    expect(await databaseService.getWorkoutDraft(USER, 'self')).toBeNull();
  });

  it('getWorkoutDrafts returns both sessions', async () => {
    restRows = [selfRow, coachRow];
    const drafts = await databaseService.getWorkoutDrafts(USER);
    expect(drafts.map(d => d.source).sort()).toEqual(['coach', 'self']);
  });

  it('deletes only the given source’s row, and refuses to delete without one', async () => {
    await databaseService.deleteWorkoutDraft(USER, 'self');
    const del = restCalls().filter(c => c.method === 'DELETE');
    expect(del).toHaveLength(1);
    expect(del[0].url).toContain(`user_id=eq.${USER}&source=eq.self`);

    await databaseService.deleteWorkoutDraft(USER);
    expect(restCalls().filter(c => c.method === 'DELETE')).toHaveLength(1);
  });
});
