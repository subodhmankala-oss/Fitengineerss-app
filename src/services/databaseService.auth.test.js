// @vitest-environment jsdom
//
// Regression test for the "user keeps getting bounced back to login on
// reload" report (2026-08-27). Root cause: signIn() races
// supabase.auth.setSession() against a 1.5s timeout and, on timeout,
// carries on using an in-memory cached token — but setSession() completing
// is also what makes the SDK persist the session to localStorage. If it
// never completes, the current tab stays logged in (via cachedAccessToken)
// but nothing survives a reload: supabase-js boots with no stored session,
// fires INITIAL_SESSION with session:null, and App.jsx's onAuthStateChange
// handler treats that exactly like a real sign-out — wiping the login flags
// and bouncing back to the login screen, even though the user "just logged
// in". See writeStoredSupabaseSession's comment in databaseService.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Fake Supabase client whose setSession() never resolves — reproduces the
// documented SDK hang so the fix (writing the session to localStorage
// unconditionally, before racing setSession()) is what's actually under
// test, not the SDK's own persistence.
const fakeAuth = {
  setSession: vi.fn(() => new Promise(() => {})),
};
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: fakeAuth, from: vi.fn(), rpc: vi.fn() })),
}));

const TOKEN_RESPONSE = {
  access_token: 'access-token-abc',
  refresh_token: 'refresh-token-xyz',
  token_type: 'bearer',
  expires_in: 3600,
  user: { id: 'user-1', email: 'client@example.com' },
};

describe('signIn() session persistence', () => {
  let databaseService;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    fakeAuth.setSession.mockClear();

    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/auth/v1/token?grant_type=password')) {
        return { ok: true, json: async () => TOKEN_RESPONSE };
      }
      if (String(url).includes('/rpc/touch_last_login')) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    });

    databaseService = (await import('./databaseService')).default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists the session to localStorage even when setSession() hangs', async () => {
    await databaseService.signIn('client@example.com', 'password123');

    const storedKey = Object.keys(localStorage).find(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    expect(storedKey).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem(storedKey));
    expect(stored.access_token).toBe('access-token-abc');
    expect(stored.refresh_token).toBe('refresh-token-xyz');
    expect(stored.user.email).toBe('client@example.com');

    // The racy setSession() call was still attempted (it hydrates the SDK's
    // in-memory state / fires onAuthStateChange for the current tab) — but
    // this test's whole point is that persistence no longer depends on it
    // ever resolving.
    expect(fakeAuth.setSession).toHaveBeenCalled();
  });

  it('rejects on bad credentials without writing a session to storage', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error_description: 'Invalid login credentials' }),
    }));

    await expect(
      databaseService.signIn('client@example.com', 'wrong-password')
    ).rejects.toThrow();

    const storedKey = Object.keys(localStorage).find(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    expect(storedKey).toBeUndefined();
  });
});
