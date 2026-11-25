// @vitest-environment jsdom
//
// A client's coach link (clients.coach_id) must survive an ordinary profile
// save. saveUserProfile used to write whatever coach_id its caller guessed, so
// a null guess dropped a connected client off their coach's list (2026-11-23),
// and a stale one could re-attach a client their coach had unattached.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: {}, from: vi.fn(), rpc: vi.fn() })),
}));

const USER = '11111111-2222-3333-4444-555555555555';
const COACH = '66666666-7777-8888-9999-000000000000';
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

describe('saveUserProfile — coach link', () => {
  let databaseService;
  let clientWrites;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'placeholder-anon-key');
    localStorage.clear();
    clientWrites = [];
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = String(url);
      const method = opts.method || 'GET';
      if (u.includes('/rest/v1/users') && method === 'GET') return json([{ id: USER, email: 'c@example.com' }]);
      if (u.includes('/rest/v1/clients') && method === 'POST') {
        clientWrites.push(JSON.parse(opts.body));
        return json([{ user_id: USER }], 201);
      }
      return json([]);
    });
    databaseService = (await import('./databaseService')).default;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const save = (extra) => databaseService.saveUserProfile({
    id: USER, userName: 'Kiran', email: 'c@example.com', role: 'client', userWeight: '70', ...extra,
  });

  it.each([
    ['no coach_id', {}],
    ['a null coach_id', { coach_id: null }],
    ['a cached coach_id', { coach_id: COACH }],
  ])('never writes the link when the caller passes %s', async (_label, extra) => {
    await save(extra);
    expect(clientWrites).toHaveLength(1);
    expect(clientWrites[0]).toMatchObject({ user_id: USER, full_name: 'Kiran', weight_kg: 70 });
    expect(clientWrites[0]).not.toHaveProperty('coach_id');
  });
});
