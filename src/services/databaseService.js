import { createClient } from '@supabase/supabase-js';
import { calculateTargetsGeneric, PROGRAM_TO_GOAL_LABEL, ACTIVITY_TO_LABEL, CONCERN_TO_LABEL } from '../utils/targets';
import { parseTimeStringToSeconds } from '../utils/liveWorkoutTimer';
import { isCardioExercise, isTimedExercise, isBodyweightExercise } from '../data/exerciseLibrary';
import { adaptiveTimeout } from '../utils/networkQuality';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

console.log('Supabase Env Check:', {
  configured: isSupabaseConfigured,
  urlLength: supabaseUrl ? supabaseUrl.length : 0,
  keyLength: supabaseAnonKey ? supabaseAnonKey.length : 0
});

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: window.localStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

// ─── CACHED SESSION TOKEN (for restSelect/restRpc — never call getSession()
// here) ───
// restSelect/restRpc below hit PostgREST directly instead of going through
// the SDK, specifically to dodge the SDK's token-refresh hang (see the
// "RAW POSTGREST READ" comment further down). Calling supabase.auth.
// getSession() from inside them would reintroduce that exact hang. Instead,
// App.jsx's existing onAuthStateChange listener (event-driven — fires when a
// session becomes available, never blocks waiting on a refresh) calls
// setCachedAuthToken() below whenever the session changes, and restSelect/
// restRpc just read the cached value synchronously. Falls back to the anon
// key when logged out (e.g. public exercise-library reads), same as before.
let cachedAccessToken = null;
export function setCachedAuthToken(token) {
  cachedAccessToken = token || null;
}
function isFreshToken(token, expiresAtUnixSeconds) {
  // 60s safety buffer so a request doesn't start with a token that expires
  // mid-flight.
  return !!token && (!expiresAtUnixSeconds || expiresAtUnixSeconds * 1000 > Date.now() + 60000);
}
// Resolves the bearer token for restSelect, refreshing proactively rather
// than trusting cachedAccessToken forever once set. Two failure modes this
// covers, both discovered the same way — a coach/client's dashboard reads
// (My Clients, Live Log, History, etc.) going silently empty rather than
// erroring, because a stale/anon-key request against
// sql/lock_down_reads.sql's auth.uid()-based policies comes back 200 with
// zero rows, not 401 — so the *reactive* 401-retry below never even fires:
//
// 1. Cold start (2026-08-08): onAuthStateChange fires asynchronously, so a
//    mount-time restSelect call can run before setCachedAuthToken has been
//    called at all. Fixed by warming from the session supabase-js already
//    persisted to localStorage (persistSession: true).
// 2. Mid-session staleness (2026-08-08, reported ~10-15min after
//    backgrounding the app): cachedAccessToken was set once and never
//    rechecked — if it silently expires while backgrounded (mobile browsers
//    throttle timers, so the SDK's own autoRefreshToken can miss its
//    window), every restSelect after that point used a dead token. Fixed by
//    always checking the persisted session's real expiry (not just
//    whichever value happens to be cached in memory) and refreshing via the
//    raw endpoint (refreshAccessTokenRaw, same SDK-hang bypass as the 401
//    path) *before* the request, not only after it 401s.
async function resolveBearerToken() {
  let stored = readStoredSupabaseSession();
  let token = stored?.session?.access_token;
  let expiresAt = stored?.session?.expires_at; // unix seconds

  if (isFreshToken(token, expiresAt)) {
    cachedAccessToken = token;
    return token;
  }

  if (stored?.session?.refresh_token) {
    const refreshed = await refreshAccessTokenRaw();
    if (refreshed) return refreshed;
  }

  // Our refresh attempt may have lost a race with the SDK's own background
  // autoRefreshToken (which can succeed even in cases where it later hangs
  // elsewhere) — re-read localStorage once more before giving up, in case
  // it already holds a fresher token than what we started with.
  stored = readStoredSupabaseSession();
  token = stored?.session?.access_token;
  expiresAt = stored?.session?.expires_at;
  if (isFreshToken(token, expiresAt)) {
    cachedAccessToken = token;
    return token;
  }

  return cachedAccessToken || supabaseAnonKey;
}

// Exported wrapper around resolveBearerToken for callers OUTSIDE this file
// that need a real signed-in user's access token — same safe, never-hangs
// expiry-check-and-refresh, but returns null instead of falling back to the
// anon key, since a caller asking for "the user's token" needs to tell "no
// real session" apart from "here's a token" (the anon key would satisfy
// neither and silently masquerade as a real one). Added 2026-08-25 so
// Onboarding.jsx's coach-apply-via-Google-session flow could stop calling
// supabase.auth.getSession() directly — see connectClientToCoach's comment
// above for why that call is unsafe anywhere in this app.
export async function resolveRealAccessToken() {
  const token = await resolveBearerToken();
  return (token && token !== supabaseAnonKey) ? token : null;
}

// ─── RAW TOKEN REFRESH (SDK-hang bypass) ───
// cachedAccessToken above is set once per onAuthStateChange event and never
// updates itself in between — there's no timer refreshing it, and the SDK's
// own background refresh is the exact thing that hangs on this project (see
// signIn()'s comment). So once the ~1hr access token expires mid-session,
// every restSelect() call below started 401'ing — and every current caller
// (getWorkoutLogsForUser, getBodyMeasurements, fetchClientPlans, etc.) wraps
// its restSelect in a try/catch that swallows ANY failure into "no rows",
// identical in the UI to the client genuinely having nothing. That's how a
// coach's Live Log/History/Measurements/Send Plan tabs can all go blank for
// a real client with real data still sitting untouched in the DB — this
// looked like "lost data" but was a silently-expired read, not a deleted
// row (root-caused for a client with 76 workout_logs / 6 workout_plans that
// disappeared from the coach's view with no error surfaced, 2026-08-08).
// Fixed by refreshing via the raw token endpoint (same bypass signIn() uses)
// instead of the hanging supabase.auth.refreshSession(), and retrying the
// read once. Session storage key format is supabase-js v2's own
// "sb-<project-ref>-auth-token" — read by prefix/suffix instead of computing
// the ref, so this keeps working if the project ref ever changes.
let refreshInFlight = null;
function readStoredSupabaseSession() {
  try {
    const key = Object.keys(window.localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return { key, session: JSON.parse(raw) };
  } catch {
    return null;
  }
}
// Writes a session directly to localStorage in supabase-js v2's own storage
// shape, independent of supabase.auth.setSession() ever completing.
//
// ROOT CAUSE (2026-08-27): signIn() below races setSession() against a
// 1.5s timeout and just continues on timeout ("SDK-hang bypass") — which
// keeps the CURRENT tab working via cachedAccessToken, but if setSession()
// is the thing that hangs, it never gets to persist anything to storage
// either (that's the SDK's job, done as a side effect of setSession()
// resolving). The user is fully logged in for this tab and never notices —
// until they close/reload the app: supabase-js boots, finds nothing under
// "sb-<ref>-auth-token" in localStorage, fires INITIAL_SESSION with
// session:null, and App.jsx's onAuthStateChange handler treats that
// exactly like a real sign-out (see the ghost-login branch there), wiping
// the cached login flags and bouncing back to the login screen — even
// though the user "just logged in". Writing the raw token response here,
// unconditionally and before the racy setSession() call, means the session
// survives a reload regardless of whether the SDK call ever finishes.
function writeStoredSupabaseSession(session) {
  if (!session?.access_token || !session?.refresh_token) return;
  try {
    const existingKey = Object.keys(window.localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    const ref = (() => {
      try { return new URL(supabaseUrl).hostname.split('.')[0]; } catch { return null; }
    })();
    const key = existingKey || (ref ? `sb-${ref}-auth-token` : null);
    if (!key) return;
    window.localStorage.setItem(key, JSON.stringify(session));
  } catch { /* storage full/unavailable — best effort only */ }
}
async function refreshAccessTokenRaw() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const stored = readStoredSupabaseSession();
    const refreshToken = stored?.session?.refresh_token;
    if (!refreshToken) return null;
    // Every OTHER raw fetch in this file bounds itself with an
    // AbortController timeout (see restSelect, lookupProfileViaServer,
    // etc.) — this one didn't, and every caller (resolveBearerToken, and
    // through it restSelect/lookupProfileViaServer/every server-fallback
    // helper) AWAITS this before ever starting its own timeout. So if this
    // specific request stalls (dead connection, an intermediary that
    // swallows it silently — the auth token-refresh endpoint, unlike a
    // normal data read, has no retry/fallback path built on top of it),
    // literally everything downstream hangs forever with nothing to time it
    // out. Confirmed 2026-08-31: CoachDetailsModal stuck on "Loading coach
    // details…" indefinitely, with the request never reaching the
    // AbortController-guarded fetch inside lookupProfileViaServer at all.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), adaptiveTimeout(8000));
    try {
      const resp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: controller.signal
      });
      if (!resp.ok) return null;
      const data = await resp.json().catch(() => null);
      if (!data?.access_token) return null;
      setCachedAuthToken(data.access_token);
      // Keep the persisted session in sync too, so a page reload (or the SDK,
      // if it ever does pick a request up) sees the same fresh token instead
      // of immediately re-expiring back to the one that just failed.
      try {
        window.localStorage.setItem(stored.key, JSON.stringify({
          ...stored.session,
          access_token: data.access_token,
          refresh_token: data.refresh_token || refreshToken
        }));
      } catch { /* best-effort */ }
      return data.access_token;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

// ─── RAW POSTGREST READ (SDK-hang bypass) ───
// The Supabase JS SDK stalls on this project when the auth token needs
// refreshing: any .from().select() awaits the token, and the refresh hangs,
// so the query never settles (see App.jsx password-reset for the same auth
// workaround). For read-only calls on the client-home critical path we hit
// PostgREST directly with the anon apikey and an AbortController timeout, so
// the request can never hang the UI. This does NOT change RLS scoping — it's
// the same endpoint/role the anon SDK client already uses (verified these
// exact queries return identical rows), and every filter is passed explicitly.
const REST_BASE = isSupabaseConfigured ? `${supabaseUrl}/rest/v1` : '';

// ─── EXERCISE LIBRARY CACHE ───
// getExerciseLibrary() used to hit the network fresh (seed-emptiness-check +
// full select — two sequential round-trips) every single time the "Add
// Exercise" picker was opened, which is what made the modal feel like it
// took ~3s to appear each time. The library barely ever changes within a
// session, so cache it in memory: the first open pays the network cost,
// every later open in the same tab session is instant. seededOnce guards
// the emptiness-check round-trip specifically, since once we've confirmed
// the table is non-empty this session there's no need to keep re-asking.
let exerciseLibraryCache = null;
let exerciseLibraryFetchPromise = null;
let seededOnce = false;

async function restSelect(pathAndQuery, { timeoutMs = adaptiveTimeout(8000) } = {}) {
  const doFetch = async (token) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${REST_BASE}/${pathAndQuery}`, {
        method: 'GET',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await doFetch(await resolveBearerToken());
  // 401 with a cached (non-anon) token almost certainly means that token
  // expired mid-session — refresh once via the raw token endpoint and retry
  // before giving up (see refreshAccessTokenRaw's comment above for why this
  // matters: callers treat any failure here as "zero rows").
  if (res.status === 401 && cachedAccessToken) {
    const refreshed = await refreshAccessTokenRaw();
    if (refreshed) res = await doFetch(refreshed);
  }
  if (!res.ok) throw new Error(`PostgREST ${res.status} ${res.statusText}`);
  return await res.json();
}

// Authoritative, RLS-proof profile read via our own serverless function (see
// api/lookup-profile.js), used ONLY as a fallback when the direct PostgREST
// read above comes back empty. An empty result there can mean "no such
// account" OR "RLS refused this read" — they're indistinguishable, and the
// second one happens on every login that reads a profile before its auth
// session is fully established. Believing it is what trapped returning
// clients in the onboarding wizard forever.
//
// Sends the real session token when there is one (the server prefers it and
// resolves the email from the token itself, so this can't read anyone else's
// profile). Never throws: any failure returns null so the caller falls back to
// its existing behaviour rather than breaking login outright.
async function lookupProfileViaServer(email) {
  const doFetch = async (token) => {
    const headers = { 'Content-Type': 'application/json' };
    // Only a real user token is worth sending — the anon key proves nothing
    // and would just be rejected.
    if (token && token !== supabaseAnonKey) headers.Authorization = `Bearer ${token}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), adaptiveTimeout(8000));
    try {
      return await fetch('/api/lookup-profile', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    // Fire immediately with whatever token is already sitting in
    // localStorage/memory — NOT resolveBearerToken(), which proactively
    // refreshes (a real network round-trip, ~seconds when it's slow) before
    // this even gets a chance to try. That upfront wait made every caller of
    // this function (this modal included) feel hung even when the current
    // token was still perfectly valid. Refresh-and-retry only kicks in below
    // on an actual 401 — same reactive pattern restSelect already uses for
    // its own 401 handling, just applied here too instead of only there.
    const stored = readStoredSupabaseSession();
    const quickToken = cachedAccessToken || stored?.session?.access_token || supabaseAnonKey;
    let resp = await doFetch(quickToken);

    // 401 means that quick token really was expired/invalid — NOW pay for a
    // real refresh (this is the "just reopened the app" moment the old
    // comment here described) and retry once before giving up. Confirmed
    // 2026-08-11: a client with onboarding_completed=true in the DB was
    // shown the onboarding wizard again after being idle/closed for a
    // while, because a stale token here silently 401'd and this whole
    // fallback returned null instead of the real profile.
    if (resp.status === 401) {
      const refreshed = await refreshAccessTokenRaw();
      if (refreshed) resp = await doFetch(refreshed);
    }
    if (!resp.ok) return null;
    return await resp.json().catch(() => null);
  } catch (e) {
    console.warn('lookupProfileViaServer failed (non-fatal):', e?.message || e);
    return null;
  }
}

// RLS-proof coach roster read via api/get-coach-clients.js — see that file's
// comment. Returns the raw clients array (same shape as the direct
// PostgREST read, joined with users), or null on any failure; never throws.
async function getCoachClientsViaServer(coachId) {
  try {
    const { headers, email } = await serverFallbackAuth();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), adaptiveTimeout(8000));
    try {
      const resp = await fetch('/api/get-coach-clients', {
        method: 'POST',
        headers,
        body: JSON.stringify({ coachId, email }),
        signal: controller.signal
      });
      if (!resp.ok) return null;
      const data = await resp.json().catch(() => null);
      return Array.isArray(data?.clients) ? data.clients : null;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.warn('getCoachClientsViaServer failed (non-fatal):', e?.message || e);
    return null;
  }
}

// RLS-proof workout_plans read via api/get-workout-plans.js — see that
// file's comment. Returns the raw plans array (same shape as the direct
// PostgREST read), or null on any failure; never throws.
async function getWorkoutPlansViaServer(userId) {
  try {
    const { headers, email } = await serverFallbackAuth();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), adaptiveTimeout(8000));
    try {
      const resp = await fetch('/api/get-workout-plans', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, email }),
        signal: controller.signal
      });
      if (!resp.ok) return null;
      const data = await resp.json().catch(() => null);
      return Array.isArray(data?.plans) ? data.plans : null;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.warn('getWorkoutPlansViaServer failed (non-fatal):', e?.message || e);
    return null;
  }
}

// The logged-in client's coach display name, resolved server-side (immune to
// the RLS blanking that makes the direct users/coaches reads come back empty).
// Returns null when there's no coach or the lookup fails; never throws.
async function getCoachNameViaServer() {
  const email = (localStorage.getItem('userEmail') || '').trim().toLowerCase();
  if (!email) return null;
  const serverProfile = await lookupProfileViaServer(email);
  return serverProfile?.coachName || null;
}

// Same idea as getCoachNameViaServer, but the full business-profile object
// (see api/data-read.js's handleLookupProfile). Used as getCoachDetailsById's
// fallback: whenever the direct authenticated read can't be trusted (no/bad
// coachId, RLS blanking on a stale token, a transient failure), this
// service-role read is immune to all of that.
async function getCoachDetailsViaServer() {
  const email = (localStorage.getItem('userEmail') || '').trim().toLowerCase();
  if (!email) return null;
  const serverProfile = await lookupProfileViaServer(email);
  return serverProfile?.coachDetails || null;
}

// Shared auth headers for the workout-log server fallbacks below — same
// token/email resolution as lookupProfileViaServer.
// MUST go through resolveBearerToken(), not read the stored access_token
// raw. This used to do the latter — no expiry check, no refresh — which
// quietly broke every server fallback the moment the ~1hr access token
// expired:
//
//   coach saves a client's session -> direct workout_logs insert is rejected
//   42501 by design (RLS is auth.uid()-based and the coach is not the client,
//   which is the entire reason this fallback exists) -> fallback posts to
//   /api/save-workout-session carrying an EXPIRED bearer -> the endpoint's
//   /auth/v1/user check fails -> verifiedEmail is null -> its body-email
//   escape hatch is localhost-only, so in production it 401s -> resp.ok is
//   false -> saveWorkoutLogsViaServer returns false -> saveWorkoutSession
//   rethrows the original error -> "❌ Failed to save session."
//
// That makes the failure a pure function of session length, which is exactly
// how it presented: a coach running a real 5-hour in-person session (timers
// in the reports read 04:59:24 and 05:53:12 — the token had been dead for
// four hours) could not save ANY of that day's workouts, while short test
// sessions saved fine. Reported 2026-08-13.
//
// resolveBearerToken() already solves this correctly for restSelect/
// restInsert (checks the persisted expiry, refreshes via the raw endpoint,
// re-reads in case the SDK won the race). Reusing it here means the fallback
// is authenticated with a live token instead of whatever happens to be
// sitting in localStorage.
async function serverFallbackAuth() {
  const token = await resolveBearerToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token && token !== supabaseAnonKey) headers.Authorization = `Bearer ${token}`;
  const email = (localStorage.getItem('userEmail') || '').trim().toLowerCase();
  return { headers, email };
}

// RLS-proof workout_logs read via api/get-workout-logs.js — see that file's
// comment. Returns the log array, or null if the fallback itself failed (the
// caller decides what null means; never throws).
async function getWorkoutLogsViaServer(userId) {
  try {
    const { headers, email } = await serverFallbackAuth();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), adaptiveTimeout(8000));
    try {
      const resp = await fetch('/api/get-workout-logs', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, email }),
        signal: controller.signal
      });
      if (!resp.ok) return null;
      const data = await resp.json().catch(() => null);
      return Array.isArray(data?.logs) ? data.logs : null;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.warn('getWorkoutLogsViaServer failed (non-fatal):', e?.message || e);
    return null;
  }
}

// RLS-proof workout_drafts read via api/get-workout-draft.js (data-read.js's
// 'workout-draft' resource) — see saveWorkoutDraftViaServer's comment below
// for why this pairs with it. Returns the raw DB row (or null), or null on
// any failure; never throws.
async function getWorkoutDraftViaServer(userId) {
  try {
    const { headers, email } = await serverFallbackAuth();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), adaptiveTimeout(8000));
    try {
      const resp = await fetch('/api/get-workout-draft', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, email }),
        signal: controller.signal
      });
      if (!resp.ok) return null;
      const data = await resp.json().catch(() => null);
      return data?.draft || null;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.warn('getWorkoutDraftViaServer failed (non-fatal):', e?.message || e);
    return null;
  }
}

// RLS-proof workout_logs write via api/save-workout-session.js — see that
// file's comment. Returns true on success, false on any failure (caller
// decides how to surface that; never throws).
async function saveWorkoutLogsViaServer(records) {
  try {
    const { headers, email } = await serverFallbackAuth();
    const controller = new AbortController();
    // 20s, not 10s: this is the LAST chance to persist a session the coach
    // just spent an hour logging, and the caller's own ceiling now allows 25s
    // (see handleSaveLiveSession). Aborting a save that would have landed is
    // strictly worse here than waiting a few more seconds.
    const timer = setTimeout(() => controller.abort(), adaptiveTimeout(20000));
    try {
      const resp = await fetch('/api/save-workout-session', {
        method: 'POST',
        headers,
        body: JSON.stringify({ records, email }),
        signal: controller.signal
      });
      if (!resp.ok) {
        // Used to `return resp.ok` and discard the reason entirely, which is
        // why a production 401 from an expired bearer looked identical to any
        // other failure and took days to pin down. Always say what happened.
        const body = await resp.text().catch(() => '');
        console.error('saveWorkoutLogsViaServer: /api/save-workout-session',
          resp.status, body.slice(0, 300), '| sent auth:', !!headers.Authorization);
        return false;
      }
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.error('saveWorkoutLogsViaServer failed:', e?.name === 'AbortError' ? 'timed out after 20s' : (e?.message || e));
    return false;
  }
}

// RLS-proof workout_drafts write via api/save-workout-draft.js — see that
// file's comment. `record` is already in DB column shape (as built by
// saveWorkoutDraft below). Returns true on success, false on any failure
// (caller decides how to surface that; never throws).
async function saveWorkoutDraftViaServer(record) {
  try {
    const { headers, email } = await serverFallbackAuth();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), adaptiveTimeout(8000));
    try {
      const resp = await fetch('/api/save-workout-draft', {
        method: 'POST',
        headers,
        body: JSON.stringify({ record, email }),
        signal: controller.signal
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        console.error('saveWorkoutDraftViaServer: /api/save-workout-draft',
          resp.status, body.slice(0, 300), '| sent auth:', !!headers.Authorization);
        return false;
      }
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.error('saveWorkoutDraftViaServer failed:', e?.name === 'AbortError' ? 'timed out after 8s' : (e?.message || e));
    return false;
  }
}

// ─── PENDING-SAVE QUEUE (last-resort durability) ───
// If a workout cannot be written right now — offline, expired session that
// even the refresh could not rescue, server down — the rows are parked in
// localStorage instead of evaporating with the error toast, and replayed on
// the next app start and whenever the device comes back online. The coach's
// draft is separately preserved (deleteWorkoutDraft only runs after a
// successful write), so this is belt-and-braces: even if someone discards the
// draft, the completed session still lands.
const PENDING_LOGS_KEY = 'pendingWorkoutLogs';

function queuePendingWorkoutLogs(records) {
  try {
    const queue = JSON.parse(localStorage.getItem(PENDING_LOGS_KEY) || '[]');
    queue.push({ records, queuedAt: new Date().toISOString() });
    // Keep the queue bounded so a permanently-failing save can't grow without
    // limit and blow the localStorage quota.
    localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify(queue.slice(-20)));
    console.warn(`Workout save deferred: ${records.length} set rows queued for automatic retry.`);
  } catch (e) {
    console.error('Could not queue workout for retry:', e?.message || e);
  }
}

export async function flushPendingWorkoutLogs() {
  let queue;
  try {
    queue = JSON.parse(localStorage.getItem(PENDING_LOGS_KEY) || '[]');
  } catch {
    return { attempted: 0, saved: 0 };
  }
  if (!Array.isArray(queue) || queue.length === 0) return { attempted: 0, saved: 0 };

  const stillPending = [];
  let saved = 0;
  for (const entry of queue) {
    if (!entry?.records?.length) continue;
    const ok = await saveWorkoutLogsViaServer(entry.records);
    if (ok) saved++; else stillPending.push(entry);
  }
  try {
    if (stillPending.length) localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify(stillPending));
    else localStorage.removeItem(PENDING_LOGS_KEY);
  } catch { /* non-fatal */ }
  if (saved) console.log(`Replayed ${saved} previously-failed workout save(s).`);
  return { attempted: queue.length, saved };
}

// Same SDK-hang bypass as restSelect, for calling a Postgres RPC function
// directly via PostgREST instead of supabase.rpc(...), which hangs on this
// project the same way .from().select() does. Confirmed cause of clients
// getting stuck on "Connecting..." forever with no error and no way out when
// redeeming a coach invite code (link_coach_and_enter_transaction is
// SECURITY DEFINER, so it doesn't need the caller's own session/RLS —
// the anon apikey is sufficient, same as restSelect).
async function restRpc(fnName, params, { timeoutMs = adaptiveTimeout(10000) } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${REST_BASE}/rpc/${fnName}`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(params || {}),
      signal: controller.signal
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data && (data.message || data.error || data.hint)) || `PostgREST ${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Same SDK-hang bypass, for a PostgREST PATCH (supabase.from().update()).
// pathAndQuery includes the filter, e.g. "invitations?code=eq.ABC123".
//
// Sends the caller's real session token (resolveBearerToken(), same as
// restSelect) rather than the anon key. With `Prefer: return=representation`,
// PostgREST re-SELECTs the touched row through the table's SELECT RLS policy
// before handing it back — and after lock_down_reads.sql (2026-08-08) that
// policy is `client_id = current_app_user_id() OR coach_id = ...`, which
// needs a real auth.uid() to ever match. Sent under the anon key, the PATCH
// itself still succeeds (UPDATE policies are permissive), but the
// representation comes back as an empty array — indistinguishable from "no
// row matched the filter" to every caller here. Confirmed cause of
// markCoachNoteRead / markClientReplySeen silently no-op'ing (row updated,
// caller sees nothing and retries forever) (2026-08-09).
async function restUpdate(pathAndQuery, body, { timeoutMs = adaptiveTimeout(8000) } = {}) {
  const doFetch = async (token) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${REST_BASE}/${pathAndQuery}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await doFetch(await resolveBearerToken());
  if (res.status === 401 && cachedAccessToken) {
    const refreshed = await refreshAccessTokenRaw();
    if (refreshed) res = await doFetch(refreshed);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.message || data.error || data.hint)) || `PostgREST ${res.status} ${res.statusText}`;
    // Attach PostgREST's own error code (e.g. 42703 for a missing column) so
    // callers that need to distinguish "column not migrated yet" from other
    // failures — see saveCoachProfile's fallback-retry — can still inspect
    // it, same as the SDK's error.code did.
    const err = new Error(msg);
    if (data && data.code) err.code = data.code;
    throw err;
  }
  return Array.isArray(data) ? data[0] : data;
}

// Same SDK-hang bypass, for a PostgREST POST (supabase.from().insert()).
// Confirmed cause of the client Measurements screen sticking on "Saving…"
// forever with no error — .insert() awaits the same stuck auth-refresh as
// .select() (see restSelect above).
//
// Sends the caller's real session token (resolveBearerToken()), not the anon
// key — same reasoning as restUpdate above: `Prefer: return=representation`
// re-SELECTs the just-inserted row through the table's SELECT RLS policy, and
// under the anon key that policy never matches post-lock_down_reads.sql, so
// the insert silently succeeds while the representation comes back empty.
// This function then returned `undefined`, and every caller (saveCoachNote,
// saveBodyMeasurements, generateInvitationCode) dereferences `data.id`/
// `data.*` on that undefined value — throwing, which their own try/catch
// reports as "the write failed" even though the row is sitting in the table.
// Confirmed cause of "Send note" on the coach home screen doing nothing (no
// toast even shows there — it only renders inside the Live Log tab — so it
// just looked like the button silently did nothing) (2026-08-09).
async function restInsert(pathAndQuery, body, { timeoutMs = adaptiveTimeout(8000) } = {}) {
  const doFetch = async (token) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${REST_BASE}/${pathAndQuery}`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await doFetch(await resolveBearerToken());
  if (res.status === 401 && cachedAccessToken) {
    const refreshed = await refreshAccessTokenRaw();
    if (refreshed) res = await doFetch(refreshed);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.message || data.error || data.hint)) || `PostgREST ${res.status} ${res.statusText}`;
    // Attach PostgREST's own error code (e.g. 42703/PGRST204 for a missing
    // column) so callers that need to distinguish "column not migrated yet"
    // from other failures — see saveWorkoutSession's fallback-retry — can
    // still inspect it, same as the SDK's error.code did.
    const err = new Error(msg);
    if (data && data.code) err.code = data.code;
    throw err;
  }
  return Array.isArray(data) ? data[0] : data;
}

// Same SDK-hang bypass, for a PostgREST upsert (supabase.from().upsert()).
// onConflict is passed as the `on_conflict` query param and
// `Prefer: resolution=merge-duplicates` makes PostgREST do an upsert instead
// of a plain insert (which would 409 on a conflicting key). Same
// return=representation caveat as restInsert/restUpdate above — sent under
// the caller's real bearer token, or the RLS re-select comes back empty.
async function restUpsert(pathAndQuery, body, onConflict, { timeoutMs = adaptiveTimeout(8000) } = {}) {
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  const fullPath = onConflict ? `${pathAndQuery}${sep}on_conflict=${encodeURIComponent(onConflict)}` : pathAndQuery;
  const doFetch = async (token) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${REST_BASE}/${fullPath}`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await doFetch(await resolveBearerToken());
  if (res.status === 401 && cachedAccessToken) {
    const refreshed = await refreshAccessTokenRaw();
    if (refreshed) res = await doFetch(refreshed);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.message || data.error || data.hint)) || `PostgREST ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return Array.isArray(data) ? data[0] : data;
}

// Same SDK-hang bypass, for a PostgREST DELETE (supabase.from().delete()).
// pathAndQuery includes the filter, e.g. "body_measurements?id=eq.<uuid>".
//
// Sends the caller's real session token (resolveBearerToken(), same as
// restUpdate/restInsert/restUpsert) instead of the bare anon key. Every
// DELETE policy on the tables this hits today (workout_drafts, workout_plans,
// body_measurements) happens to be `using (true)`, so the anon key wasn't
// actually silently no-op'ing any of them — but that's the exact shape of
// bug this project keeps re-discovering every time a table's RLS gets
// tightened (see restUpdate's comment above for the coach_notes instance of
// it). Fixing this now rather than waiting for the next lockdown pass to hit
// a DELETE call and reproduce the same "did nothing, no error" symptom.
async function restDelete(pathAndQuery, { timeoutMs = adaptiveTimeout(8000) } = {}) {
  const doFetch = async (token) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${REST_BASE}/${pathAndQuery}`, {
        method: 'DELETE',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await doFetch(await resolveBearerToken());
  if (res.status === 401 && cachedAccessToken) {
    const refreshed = await refreshAccessTokenRaw();
    if (refreshed) res = await doFetch(refreshed);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const msg = (data && (data.message || data.error || data.hint)) || `PostgREST ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
}

// ─── CANONICAL USER ID RESOLVER (auth-uid poisoning repair) ───
// This app stores public.users.id (a random uuid generated by the users-row
// upsert) as localStorage 'userId'. That value is NOT the Supabase auth UID
// (session.user.id) — on this project the two are always different. Several
// code paths historically fell back to the auth UID when the cached userId was
// missing, poisoning localStorage with a value that matches no clients /
// workout_logs row. The symptom: a genuinely coach-connected client reads
// their own clients row by user_id, gets nothing back, and sees "Connect to
// coach" forever (plus empty/wrong workout data), even though the DB link is
// perfectly intact. Confirmed 2026-07-09 for two real clients.
//
// This re-derives the true public.users.id from the logged-in email via raw
// PostgREST (SDK-hang-proof, same as restSelect) and repairs localStorage in
// place, so any already-poisoned device self-heals on the next read. Safe for
// every role — it just re-affirms public.users.id by email. Falls back to the
// cached value if email is unknown or the lookup fails (never returns null when
// a cached id exists).
async function resolveCanonicalUserId() {
  const cached = localStorage.getItem('userId');
  const email = (localStorage.getItem('userEmail') || '').trim().toLowerCase();
  if (!email || !isSupabaseConfigured) return cached;
  try {
    const rows = await restSelect(`users?email=eq.${encodeURIComponent(email)}&select=id`);
    const realId = (Array.isArray(rows) && rows[0]?.id) ? rows[0].id : null;
    if (realId && realId !== cached) {
      console.warn('[resolveCanonicalUserId] repairing poisoned userId in localStorage', { cached, realId });
      localStorage.setItem('userId', realId);
    }
    if (realId) return realId;
    // Nothing came back AND nothing cached: the read was almost certainly
    // RLS-blanked (returns [] rather than erroring, so the catch below never
    // fires) at a moment when no valid token existed yet. Returning null here
    // strands every user-scoped caller — they retry against nothing forever,
    // which is what left the dashboard on "Analyzing progress history…" and
    // the coach badge on "Checking…" indefinitely. Recover the id
    // server-side, where the service-role key is immune to RLS, and re-cache
    // it so this self-heals instead of needing a re-login.
    if (!cached) {
      const serverProfile = await lookupProfileViaServer(email);
      const serverId = serverProfile?.found ? serverProfile.user?.id : null;
      if (serverId) {
        console.warn('[resolveCanonicalUserId] recovered missing userId server-side');
        localStorage.setItem('userId', serverId);
        return serverId;
      }
    }
    return cached;
  } catch (e) {
    console.error('[resolveCanonicalUserId] lookup failed, using cached userId:', e);
    if (cached) return cached;
    const serverProfile = await lookupProfileViaServer(email);
    const serverId = serverProfile?.found ? serverProfile.user?.id : null;
    if (serverId) localStorage.setItem('userId', serverId);
    return serverId || null;
  }
}

export const TRAINER_EMAILS = [
  'subodhmankala@gmail.com',
  'trainer@fitengineers.com',
  'coach@fitengineers.com'
];

export const isTrainer = (email) => {
  if (!email) return false;
  const hardcoded = TRAINER_EMAILS.includes(email.toLowerCase());
  if (hardcoded) return true;
  const cachedRole = localStorage.getItem('userRole');
  return cachedRole === 'coach' || cachedRole === 'coach_pending' || cachedRole === 'super-admin' || cachedRole === 'admin';
};

export const isSuperAdmin = (email) => {
  if (!email) return false;
  return email.toLowerCase() === 'subodhmankala@gmail.com';
};


const getCleanClientKey = async (userId) => {
  if (!userId) return 'guest';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (isUuid && isSupabaseConfigured && supabase) {
    try {
      const rows = await restSelect(`users?id=eq.${userId}&select=full_name`);
      const user = rows[0] || null;
      if (user && user.full_name) {
        return user.full_name.toLowerCase().replace(/\s+/g, '');
      }
    } catch (e) {
      console.error('Error resolving UUID to name for local storage key:', e);
    }
  }
  return userId.toLowerCase().replace(/\s+/g, '');
};

const INVITE_CODE_TTL_MS = 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeInviteCode = (code) => String(code || '').trim().toUpperCase();

// A workout plan's `exercises` is a JSONB column, but it does not always come
// back as a usable array: legacy/partially-written rows can hold null, and
// some rows hold the JSON as a *string* rather than parsed (the generic
// workout-template loader already guards for exactly this — see
// getGenericWorkoutsByLevel's `Array.isArray(t.exercises) ? ... : JSON.parse`).
// Every consumer then does `plan.exercises.map(...)` directly, so a null row
// throws a TypeError when the plan is opened and a string row maps over
// characters — both surfacing as the reported "template opens empty" (some
// plans open fine, others don't). Normalizing once here, at the single read
// boundary, keeps every caller safe instead of scattering guards.
// Exercises whose `sets` is missing/not an array are dropped rather than
// carried through, since an exercise with no sets renders as a blank row.
function normalizePlanExercises(raw) {
  let list = raw;
  if (typeof list === 'string') {
    try { list = JSON.parse(list || '[]'); } catch { list = []; }
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter(ex => ex && typeof ex.name === 'string' && ex.name.trim())
    .map(ex => ({ ...ex, sets: Array.isArray(ex.sets) ? ex.sets : [] }))
    .filter(ex => ex.sets.length > 0);
}

const createInviteCode = () => {
  let code = '';
  while (code.length < 6) {
    code += Math.random().toString(36).slice(2).toUpperCase();
  }
  return code.slice(0, 6);
};

const isPastTimestamp = (value) => {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
};

/**
 * DATABASE SERVICE
 * ----------------
 * Dual-layer service that communicates with a live cloud Supabase database
 * if configured in environment variables (.env), otherwise falls back
 * to high-performance local storage (localStorage) for seamless local-only testing.
 */
const databaseService = {
  supabase,
  // Helper for mock DB
  getMockTable(name) {
    return JSON.parse(localStorage.getItem(`mock_${name}`) || '[]');
  },
  saveMockTable(name, data) {
    localStorage.setItem(`mock_${name}`, JSON.stringify(data));
  },

  // ─── USER PROFILE ───
  async saveUserProfile(profile) {
    const email = (profile.email || `${profile.userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`).trim().toLowerCase();
    let userId = profile.id || localStorage.getItem('userId');
    if (isSupabaseConfigured && supabase && userId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      // Stale/mock id from an earlier offline fallback — don't let it leak into a live cloud session.
      userId = null;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        // 1. Ensure user row exists in users
        // Raw PostgREST (restSelect/restUpsert) instead of supabase.from() —
        // same SDK-hang bypass as everywhere else in this file; saveUserProfile
        // runs on every signup/profile-save, so a stuck token refresh here
        // would freeze onboarding entirely.
        let user = null;
        if (userId) {
          const rows = await restSelect(`users?id=eq.${userId}&select=*`);
          user = rows[0] || null;
        }
        if (!user) {
          const rows = await restSelect(`users?email=eq.${encodeURIComponent(email)}&select=*`);
          user = rows[0] || null;
        }
        if (!user) {
          user = await restUpsert('users', { email }, 'email');
        }
        userId = user.id;

        // 2. Write client/coach record
        if (profile.role === 'coach' || profile.role === 'super-admin' || profile.role === 'admin') {
          const storedRole = profile.role === 'admin' ? 'super-admin' : profile.role;
          try {
            await restUpdate(`users?id=eq.${userId}`, {
              full_name: profile.userName,
              role: storedRole
            });
          } catch (userRoleError) {
            console.warn('Cloud DB: Could not sync coach role onto users row:', userRoleError);
          }

          await restUpsert('coaches', {
            user_id: userId,
            status: 'approved',
            brand_name: profile.brand || `${profile.userName} Fitness`
          }, 'user_id');
          // Cache userCoachId here so getClientsForCoach() below this
          // function has something to query against. Without this, a fresh
          // coach signup's userCoachId only ever got set by the mock
          // fallback block at the bottom of this function — which used to
          // run unconditionally even on a successful cloud write and always
          // wrote a fake generated id (coach-id-<timestamp>). "My Clients"
          // then queried real client rows against that fake id and always
          // came back empty. Confirmed 2026-08-10 for the super-admin coach
          // account, which had real attached clients the whole time.
          //
          // Deliberately userId here, NOT coaches.id from the upsert above:
          // verified directly against the live DB (2026-08-10) that every
          // clients.coach_id value in production matches coaches.user_id —
          // zero rows match coaches.id. Several comments elsewhere in this
          // file assert the opposite ("coach_id refers to coaches.id, not
          // the user id") — that assumption does not hold for the actual
          // data and must not be copied into new code without re-verifying.
          localStorage.setItem('userCoachId', userId);
        } else {
          // It's a client
          await restUpsert('clients', {
            user_id: userId,
              // null until the client redeems a coach's invite code (also guards against a
              // stale 'coach-id-default' placeholder value leaking into the DB)
              coach_id: (profile.coach_id && profile.coach_id !== 'coach-id-default') ? profile.coach_id : null,
              full_name: profile.userName,
              // Omit the key entirely (not '') when this caller didn't pass a
              // phone — an upsert with phone_number:'' overwrites whatever
              // was already saved. Every profile-edit save (ClientProfile.jsx
              // etc.) doesn't carry a phone field, so `|| ''` here was
              // silently erasing the number captured at signup the first
              // time a client changed anything else on their profile.
              // JSON.stringify drops undefined-valued keys, so PostgREST's
              // upsert never touches this column when it's omitted.
              phone_number: profile.phone || undefined,
              fitness_goal: profile.userGoal,
              weight_kg: parseFloat(profile.userWeight) || null,
              height_cm: parseFloat(profile.userHeight) || null,
              age: parseInt(profile.userAge) || null,
              activity_level: profile.userActivity,
              dietary_preference: profile.userDiet,
              calorie_target: parseInt(profile.userCalorieTarget) || null,
              protein_target: parseInt(profile.userProteinTarget) || null,
              carbs_target: parseInt(profile.userCarbsTarget) || null,
              fats_target: parseInt(profile.userFatsTarget) || null,
              issue: profile.userIssue
            }, 'user_id');
        }
        console.log('Cloud DB: Saved user profile under new schema.');
      } catch (e) {
        console.error('Cloud DB Sync Error: falling back to local.', e);
      }
    }

    // Always update Local Storage
    localStorage.setItem('userName', profile.userName);
    localStorage.setItem('userEmail', email);
    if (userId) localStorage.setItem('userId', userId);
    localStorage.setItem('userAge', profile.userAge || '');
    localStorage.setItem('userHeight', profile.userHeight || '');
    localStorage.setItem('userWeight', profile.userWeight || '');
    localStorage.setItem('userActivity', profile.userActivity || '');
    localStorage.setItem('userGoal', profile.userGoal || '');
    localStorage.setItem('userDiet', profile.userDiet || '');
    localStorage.setItem('userCalorieTarget', profile.userCalorieTarget || '');
    localStorage.setItem('userProteinTarget', profile.userProteinTarget || '');
    localStorage.setItem('userCarbsTarget', profile.userCarbsTarget || '');
    localStorage.setItem('userFatsTarget', profile.userFatsTarget || '');
    if (profile.userIssue) localStorage.setItem('userIssue', profile.userIssue);
    if (profile.role) localStorage.setItem('userRole', profile.role);
    if (profile.phone) localStorage.setItem('userPhone', profile.phone);
    if (profile.brand) localStorage.setItem('userBrand', profile.brand);
    if (profile.coach_id) localStorage.setItem('userCoachId', profile.coach_id);

    if (isSupabaseConfigured && supabase && !userId) {
      // Cloud is live but we never resolved a real UUID for this user — don't mask
      // that failure behind a mock id that would break later live writes.
      throw new Error('Could not resolve your account ID with the database. Please try again.');
    }

    // Update local mock tables — offline-only. This block used to run
    // unconditionally, even right after a fully successful cloud write above,
    // which meant it ALWAYS overwrote userCoachId with a freshly-generated
    // fake id (`coach-id-<timestamp>`, matching nothing in the real `clients`
    // table) regardless of whether the cloud coaches upsert just succeeded.
    // That's what made "My Clients" show 0 for a real coach with real
    // attached clients — confirmed 2026-08-10. The cloud branch above now
    // caches the real coaches.id itself; this block must never run when the
    // cloud path was actually taken.
    if (isSupabaseConfigured && supabase) return;

    const mockUsers = this.getMockTable('users');
    let mUser = mockUsers.find(u => u.email === email || (userId && u.id === userId));
    if (!mUser) {
      mUser = { id: userId || `mock-uid-${Date.now()}`, email, auth_provider: profile.auth_provider || 'email' };
      mockUsers.push(mUser);
      this.saveMockTable('users', mockUsers);
    }
    userId = mUser.id;
    localStorage.setItem('userId', userId);

    if (profile.role === 'coach' || profile.role === 'super-admin' || profile.role === 'admin') {
      mUser.role = profile.role === 'admin' ? 'super-admin' : profile.role;
      mUser.full_name = profile.userName;
      this.saveMockTable('users', mockUsers);

      const mockCoaches = this.getMockTable('coaches');
      let mCoach = mockCoaches.find(c => c.user_id === userId);
      const coachId = mCoach?.id || `coach-id-${Date.now()}`;
      if (!mCoach) {
        mCoach = { id: coachId, user_id: userId, status: 'approved', brand_name: profile.brand || `${profile.userName} Fitness` };
        mockCoaches.push(mCoach);
      } else {
        mCoach.brand_name = profile.brand || `${profile.userName} Fitness`;
        mCoach.status = 'approved';
      }
      this.saveMockTable('coaches', mockCoaches);
      localStorage.setItem('userCoachId', coachId);
    } else {
      const mockClients = this.getMockTable('clients');
      let mClient = mockClients.find(c => c.user_id === userId);
      const clientId = mClient?.id || `client-id-${Date.now()}`;
      const clientRecord = {
        id: clientId,
        user_id: userId,
        coach_id: profile.coach_id || localStorage.getItem('userCoachId') || null,
        full_name: profile.userName,
        // Same fix as the live-DB upsert above: fall back to whatever was
        // already stored, not '', so a profile-edit save that doesn't carry
        // a phone field can't erase the number captured at signup.
        phone_number: profile.phone || mClient?.phone_number || '',
        fitness_goal: profile.userGoal,
        weight_kg: parseFloat(profile.userWeight) || null,
        height_cm: parseFloat(profile.userHeight) || null,
        age: parseInt(profile.userAge) || null,
        activity_level: profile.userActivity,
        dietary_preference: profile.userDiet,
        calorie_target: parseInt(profile.userCalorieTarget) || null,
        protein_target: parseInt(profile.userProteinTarget) || null,
        carbs_target: parseInt(profile.userCarbsTarget) || null,
        fats_target: parseInt(profile.userFatsTarget) || null,
        issue: profile.userIssue
      };
      if (!mClient) {
        mockClients.push(clientRecord);
      } else {
        Object.assign(mClient, clientRecord);
      }
      this.saveMockTable('clients', mockClients);
      localStorage.setItem('userClientId', clientId);
    }
  },

  async getUserProfile(userName) {
    const email = `${userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;
    return this.getUserProfileByEmail(email);
  },

  // ─── DAILY TRACKER LOGS ───
  async saveTrackerLog(log) {
    const userName = localStorage.getItem('userName') || 'Warrior';
    const email = localStorage.getItem('userEmail') || `${userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;

    if (isSupabaseConfigured && supabase) {
      try {
        // First get user UUID from email. Raw PostgREST (restSelect/
        // restUpsert) instead of supabase.from() — same SDK-hang bypass as
        // everywhere else in this file.
        const rows = await restSelect(`users?email=eq.${encodeURIComponent(email)}&select=id`);
        const user = rows[0] || null;

        if (user) {
          try {
            await restUpsert('tracker_logs', {
              user_id: user.id,
              log_date: log.date || new Date().toISOString().split('T')[0],
              water_glasses: parseInt(log.waterGlasses || '0'),
              synced_steps: parseInt(log.syncedSteps || '0'),
              logged_calories: parseInt(log.loggedCalories || '0'),
              logged_protein: parseInt(log.loggedProtein || '0'),
              logged_fats: parseInt(log.loggedFats || '0'),
              walk_lunch_dinner: log.walkLunchDinner === 'true' || log.walkLunchDinner === true
            }, 'user_id,log_date');
            console.log('Cloud DB: Synced daily tracker logs.');
          } catch (directError) {
            // Same fallback shape as saveWorkoutSession's workout_logs path —
            // most commonly 42501 because the caller's session token wasn't
            // ready/valid yet. See api/save-user-data.js.
            console.warn('tracker_logs client-side upsert failed, falling back to server:', directError?.message || directError);
            const { headers } = await serverFallbackAuth();
            const resp = await fetch('/api/save-user-data?action=tracker-log', {
              method: 'POST', headers, body: JSON.stringify({ log })
            });
            if (!resp.ok) throw directError;
            console.log('Cloud DB: Synced daily tracker logs (via server fallback).');
          }
        }
      } catch (e) {
        console.error('Cloud DB Tracker Sync Error:', e);
      }
    }

    // Always sync locally
    localStorage.setItem('waterGlasses', String(log.waterGlasses || '0'));
    localStorage.setItem('userSyncedSteps', String(log.syncedSteps || '0'));
    localStorage.setItem('userLoggedCalories', String(log.loggedCalories || '0'));
    localStorage.setItem('userLoggedProtein', String(log.loggedProtein || '0'));
    localStorage.setItem('userLoggedFats', String(log.loggedFats || '0'));
    localStorage.setItem('walkLunchDinner', String(log.walkLunchDinner || 'false'));
  },

  // ─── MONTHLY PROGRESS HISTORY ───
  async saveProgressHistory(history) {
    if (!history || !history.water) {
      console.warn('saveProgressHistory: No valid history provided for sync.');
      return;
    }
    const userName = localStorage.getItem('userName') || 'Warrior';
    const email = localStorage.getItem('userEmail') || `${userName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;

    if (isSupabaseConfigured && supabase) {
      try {
        const rows = await restSelect(`users?email=eq.${encodeURIComponent(email)}&select=id`);
        const user = rows[0] || null;

        if (user) {
          // Bulk upsert 30 days of data into progress_history
          const records = [];
          for (let i = 0; i < 30; i++) {
            records.push({
              user_id: user.id,
              day_number: i + 1,
              water_val: parseFloat(history.water[i]?.val || '0.0'),
              protein_val: parseInt(history.protein[i]?.val || '0'),
              fats_val: parseInt(history.fats[i]?.val || '0'),
              lifting_val: parseFloat(history.lifting[i]?.val || '0.0')
            });
          }

          try {
            await restUpsert('progress_history', records, 'user_id,day_number');
            console.log('Cloud DB: Progress history synchronized.');
          } catch (directError) {
            // Same fallback shape as tracker_logs above — see api/save-user-data.js.
            console.warn('progress_history client-side upsert failed, falling back to server:', directError?.message || directError);
            const { headers } = await serverFallbackAuth();
            const resp = await fetch('/api/save-user-data?action=progress-history', {
              method: 'POST', headers, body: JSON.stringify({ history })
            });
            if (!resp.ok) throw directError;
            console.log('Cloud DB: Progress history synchronized (via server fallback).');
          }
        }
      } catch (e) {
        console.error('Cloud DB Progress Sync Error:', e);
      }
    }

    // Cache locally
    localStorage.setItem('monthlyProgressHistory', JSON.stringify(history));
  },

  // ─── WORKOUT PROGRESS & SESSIONS ───
  async saveWorkoutSession(session) {
    const sessionClientName = session.clientName || localStorage.getItem('userName') || 'Warrior';
    const loggedInName = localStorage.getItem('userName') || '';
    const loggedInEmail = localStorage.getItem('userEmail') || '';
    
    let email = `${sessionClientName.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`;
    // If the logged-in user is the client completing the workout, use their actual email
    if (loggedInName && loggedInName.toLowerCase().replace(/\s+/g, '') === sessionClientName.toLowerCase().replace(/\s+/g, '')) {
      if (loggedInEmail) {
        email = loggedInEmail;
      }
    }

    // Captured (not thrown immediately) so the localStorage mirror below always
    // still runs even when the DB sync fails, and rethrown at the very end —
    // see the two `syncError =` sites and the throw right before the return.
    let syncError = null;

    if (isSupabaseConfigured && supabase) {
      try {
        let user = null;

        // 0. Prefer the exact client UUID the caller passed (the coach live-log
        //    sends selectedClient.id). Resolving by email/name is ambiguous when
        //    several accounts share a display name — e.g. multiple "Warrior"s —
        //    and silently writes the session to the WRONG user's workout_logs,
        //    so the intended client never sees it on their home screen.
        if (session.clientId && UUID_RE.test(session.clientId)) {
          user = { id: session.clientId };
        } else {
          // 1. Try looking up user by email. Raw PostgREST (restSelect)
          // instead of supabase.from() — same SDK-hang bypass as everywhere
          // else in this file.
          const byEmail = await restSelect(`users?email=eq.${encodeURIComponent(email)}&select=id`);
          if (byEmail[0]) {
            user = byEmail[0];
          } else {
            // 2. Try looking up user by full_name/sessionClientName (case-insensitive)
            const byName = await restSelect(`users?full_name=ilike.${encodeURIComponent(sessionClientName)}&select=id`);
            if (byName.length > 0) {
              user = byName[0];
            }
          }
        }

        if (user) {
          const records = [];
          session.exercises.forEach(ex => {
            ex.sets.forEach((set, sIdx) => {
              // Cardio sets carry distanceKm/time instead of reps/weight (see
              // isCardioExercise). Timed holds (plank etc., see isTimedExercise)
              // carry time only, no distanceKm — they reuse cardio_duration_seconds
              // to avoid a schema migration, but must NOT get a distance_km value
              // (even 0), or the read-back can't tell them apart from real cardio.
              // reps/weight_kg still get written as 0 for both so every row keeps
              // the same shape; the real values live in distance_km/
              // cardio_duration_seconds instead.
              const isCardioSet = set.distanceKm !== undefined;
              const isTimedSet = !isCardioSet && set.time !== undefined;
              // Foot Fires is the one timed exercise that also keeps the
              // Bodyweight/+Add Weight toggle (see isBodyweightExercise in
              // exerciseLibrary.js) — its weight_kg is real data, not the
              // "not applicable" 0 every other timed set gets below.
              const isTimedBodyweightSet = isTimedSet && isBodyweightExercise(ex.name);
              // Every record in this array goes into ONE PostgREST bulk
              // insert (see saveWorkoutLogsViaServer / restInsert), which
              // requires every object in the batch to have IDENTICAL keys —
              // a row with an extra/missing key fails the whole batch with
              // PGRST102 "All object keys must match", not just that row.
              // This used to build each row's keys conditionally (spreading
              // distance_km/cardio_duration_seconds/set_type/duration_seconds/
              // calories_burned only when that particular set had them), so
              // any session mixing a cardio or timed set with a normal one —
              // or a warmup/dropset tag on only SOME sets, which is the
              // ordinary way a coach logs a real session — silently failed
              // to save entirely. All-uniform test payloads (used while
              // verifying the earlier auth-token fix) never exercise this,
              // which is exactly why it went unnoticed until real mixed
              // sessions hit it in production. Reported 2026-08-13: three
              // in-progress coach sessions (Nagesh A, Mahalsa,
              // gk.goginenikiran) all failing to save.
              // Fix: every row now carries the SAME key set, with `null`
              // standing in for "not applicable" instead of omitting the
              // key. Every read site already checks `!= null` before using
              // these fields (see WorkoutTracker.jsx/TrainerDashboard.jsx),
              // so this is a no-op for anything that reads the data back —
              // only the shape sent to PostgREST changes.
              records.push({
                user_id: user.id,
                log_date: session.date,
                exercise_name: ex.name,
                set_number: sIdx + 1,
                reps: (isCardioSet || isTimedSet) ? 0 : parseInt(set.reps || '0'),
                weight_kg: (isCardioSet || (isTimedSet && !isTimedBodyweightSet)) ? 0 : parseFloat(set.weight || '0.0'),
                plan_name: session.planName || 'Custom Routine',
                distance_km: isCardioSet ? (parseFloat(set.distanceKm || '0') || 0) : null,
                cardio_duration_seconds: (isCardioSet || isTimedSet) ? parseTimeStringToSeconds(set.time) : null,
                // Warmup/Dropset/Failure tag from the logger; NULL = normal set.
                set_type: set.setType || null,
                // Live Log session timer's final duration/calories snapshot —
                // duplicated onto every row of this session (workout_logs has
                // no session-level row) and read back from any one of them.
                duration_seconds: session.durationSeconds != null ? session.durationSeconds : null,
                calories_burned: session.caloriesBurned != null ? session.caloriesBurned : null,
                // Session-level avg/max BPM from a paired Bluetooth heart
                // rate monitor (see useHeartRateMonitor) — same "duplicated
                // onto every row, read back from any one" pattern as
                // duration_seconds/calories_burned above. NULL when no
                // monitor was connected.
                avg_heart_rate_bpm: session.avgHeartRate != null ? session.avgHeartRate : null,
                max_heart_rate_bpm: session.maxHeartRate != null ? session.maxHeartRate : null
              });
            });
          });

          if (records.length > 0) {
            // Raw PostgREST (restInsert) instead of supabase.from() — same
            // SDK-hang bypass as everywhere else in this file.
            try {
              // Degrade gracefully, one column at a time, if some optional
              // workout_logs column hasn't been migrated in yet (PostgREST
              // "column not found" — code 42703 / PGRST204). This used to
              // strip ALL SIX optional columns — set_type, duration_seconds,
              // calories_burned, distance_km, cardio_duration_seconds,
              // avg_heart_rate_bpm, max_heart_rate_bpm — the instant ANY ONE
              // of them was missing, discarding perfectly good data on
              // columns that DO exist. Confirmed 2026-08-18: avg_heart_rate_
              // bpm/max_heart_rate_bpm were added to this file's INSERT
              // payload by commit c249f44 (2026-08-15) but their migration
              // (sql/supabase_workout_logs_heart_rate.sql) was never actually
              // run — so EVERY save since then hit this fallback and threw
              // away real, already-computed duration_seconds/calories_burned
              // along with the genuinely-missing heart-rate columns, even
              // though duration_seconds/calories_burned had existed and
              // worked fine since supabase_workout_logs_session_metrics.sql.
              // This is why coach and client both kept seeing null time/
              // calories in the UI for days after #42/#44 fixed the actual
              // computation — the correct numbers were computed every time,
              // then silently discarded right here before ever reaching the
              // database. Now retries by removing only the column PostgREST
              // actually named as missing, so unrelated real values survive.
              let recordsToSend = records;
              // Bounded by the number of optional columns that can ever be
              // missing — each retry removes exactly one, so this can never
              // loop more times than there are columns to lose. If every
              // attempt is exhausted without success, lastError carries the
              // final failure out to the outer catch below.
              let lastError = null;
              for (let attempt = 0; attempt < 7; attempt++) {
                try {
                  await restInsert('workout_logs', recordsToSend);
                  lastError = null;
                  break;
                } catch (error) {
                  lastError = error;
                  const missingCol = error && (error.code === '42703' || error.code === 'PGRST204')
                    ? error.message?.match(/'([a-z_]+)' column/)?.[1]
                    : null;
                  if (!missingCol) break;
                  console.warn(`workout_logs missing column '${missingCol}' — retrying without just that field. Run the matching sql/supabase_workout_logs_*.sql migration in the Supabase SQL Editor to enable it.`);
                  recordsToSend = recordsToSend.map(({ [missingCol]: _drop, ...rest }) => rest);
                }
              }
              if (lastError) throw lastError;
            } catch (error) {
              // Anything else — most commonly 42501 (RLS rejected the
              // insert because the caller's session token wasn't ready/
              // valid at the moment this fired) — falls back to the
              // service-role-backed endpoint before giving up. This is the
              // write-side twin of getUserProfileByEmail's read fallback:
              // the client already updated its local session list by this
              // point, so a swallowed failure here is a workout that LOOKS
              // saved and never actually is.
              console.warn('workout_logs client-side insert failed, falling back to server:', error?.message || error);
              const saved = await saveWorkoutLogsViaServer(records);
              if (!saved) {
                // Both paths failed. Park the rows so they are replayed
                // automatically on the next launch / when connectivity
                // returns, instead of existing only in the error toast the
                // coach is about to see. Still rethrow: the UI must report
                // honestly that it did not save right now.
                queuePendingWorkoutLogs(records);
                throw error;
              }
            }
            console.log('Cloud DB: Saved workout session sets.');
          }
        } else {
          // Neither the passed clientId nor the email/name lookup resolved a
          // real users.id — most often an RLS/timing gap reading `users` with
          // the anon key before the auth token is ready (see restSelect
          // above). This used to fall through silently: no insert, no error,
          // nothing logged — the exact "client saved a workout, coach/home
          // screen never shows it, no one gets told why" bug. Throwing here
          // routes it through the same retry-then-toast path as every other
          // failure below instead of vanishing.
          throw new Error(`Could not resolve a user account for "${sessionClientName}" (${email}) — workout not saved to the server.`);
        }
      } catch (e) {
        console.error('Cloud DB Workout Sync Error:', e);
        // Used to stop here, swallowed — saveWorkoutSession() then resolved
        // normally even though nothing reached workout_logs. That silently
        // defeated the retry-once-then-toast safety net every caller builds
        // on top of this (WorkoutTracker's saveSessionsToLocal, the coach's
        // handleSaveLiveSession) — they never saw a rejection to react to.
        // Captured instead of thrown immediately so the localStorage mirror
        // below still runs regardless, then rethrown at the end.
        syncError = e;
      }
    }

    // Mirror the global workoutSessions (already saved by WorkoutTracker) under a client-specific key
    // so the trainer dashboard can look up sessions per client without scanning all sessions.
    const clientKey = sessionClientName.toLowerCase().replace(/\s+/g, '');
    const currentGlobal = localStorage.getItem('workoutSessions');
    if (currentGlobal) {
      // Filter to only this client's sessions for the client-specific key
      try {
        const allSessions = JSON.parse(currentGlobal);
        const clientSessions = allSessions.filter(s =>
          s.clientName && s.clientName.toLowerCase().replace(/\s+/g, '') === clientKey
        );
        localStorage.setItem(`client_${clientKey}_workoutSessions`, JSON.stringify(clientSessions));
      } catch(e) {
        console.error('Error mirroring workout sessions per client:', e);
      }
    }

    // Now that the local mirror is done regardless, surface the DB failure
    // (if any) to the caller instead of the session silently "succeeding".
    if (syncError) throw syncError;
  },

  // ─── AUTHENTICATION ───
  async signUp(email, password) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    // Normalize email casing so we never create case-variant duplicate identities
    // (e.g. Foo@x.com vs foo@x.com) that split a person across two profile rows.
    email = (email || '').trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    email = (email || '').trim().toLowerCase();
    // Raw fetch instead of supabase.auth.signInWithPassword() — same SDK-hang
    // workaround as restSelect above and the password-reset flow. A coach who
    // just reset their password (a flow that already bypasses the SDK
    // entirely) hit this hanging forever on "Logging In...": the promise from
    // signInWithPassword() never resolved or rejected.
    const resp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnonKey },
      body: JSON.stringify({ email, password })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.msg || data.error_description || data.error || 'Invalid login credentials.');
    }
    // Make this real access token available to restSelect/restInsert
    // IMMEDIATELY, synchronously, not dependent on the flaky setSession()
    // call below. Without this, any caller that re-reads the user's own
    // profile right after signIn() resolves (e.g. Onboarding.jsx's client
    // login, re-checking onboarding_completed once a session exists) was
    // still using the anon key whenever setSession() hadn't finished hydrating
    // the SDK yet — RLS silently blocks that anon read and returns zero rows,
    // which looked exactly like "onboarding not done", sending a fully
    // onboarded returning client into the 4-step wizard on every login.
    // Confirmed 2026-08-10 for a real account. cachedAccessToken is what
    // resolveBearerToken() falls back to when localStorage has no fresh
    // session yet, so setting it here closes that window entirely.
    setCachedAuthToken(data.access_token);
    // Persist the session to localStorage directly, BEFORE attempting
    // setSession() below — do not depend on that racy SDK call to do it.
    // See writeStoredSupabaseSession's comment for why: without this, a
    // login that happens to hit the SDK hang works fine for the current tab
    // but silently never survives a reload/reopen.
    writeStoredSupabaseSession({
      access_token: data.access_token,
      token_type: data.token_type || 'bearer',
      expires_in: data.expires_in,
      expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + (data.expires_in || 3600)),
      refresh_token: data.refresh_token,
      user: data.user
    });
    // Hydrate the SDK client's session so downstream .from() calls and
    // onAuthStateChange listeners still see the logged-in user. Best-effort
    // with a timeout: setSession() also goes through the same browser SDK,
    // so it must never be allowed to re-introduce the hang we just avoided.
    //
    // PERF FIX 2026-08-14: this timeout was 5000ms — meaning every login
    // that happened to hit the known SDK hang (see the extensive comments
    // throughout this file on signInWithPassword/verifyOtp/updateUser all
    // sharing the same issue) sat on "Logging In..." for the FULL 5
    // seconds before this caught it and moved on, on top of whatever the
    // rest of the login flow took — a large, avoidable chunk of the
    // "5-10s to reach the dashboard" coaches/clients were reporting. The
    // success path is unaffected by shortening this: Promise.race resolves
    // the instant the real setSession() call finishes (typically well
    // under a second), so this ceiling only ever matters in the hang case
    // — it's purely how long the worst case waits before giving up and
    // continuing with the raw session (which restSelect/restRpc/etc.
    // already work correctly with via cachedAccessToken, set synchronously
    // above).
    try {
      await Promise.race([
        supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('setSession timed out')), 1500))
      ]);
    } catch (e) {
      console.warn('supabase.auth.setSession did not complete (continuing with raw session anyway):', e.message || e);
    }
    // Stamp last_login for the Super Admin Dashboard's activity tracking.
    // Fire-and-forget via SECURITY DEFINER RPC (see sql/last_login_tracking.sql)
    // — never let this delay or fail the actual login.
    restRpc('touch_last_login', { p_email: email }).catch((e) =>
      console.warn('touch_last_login failed (non-fatal):', e.message || e)
    );
    return { user: data.user, session: { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user } };
  },

  // Stamp last_login for whatever counts as "this user is active right now" —
  // not just the email/password form. signIn() above only fires on a fresh
  // credential submit, so a client who stays logged in across days (the
  // normal case with persisted Supabase sessions) never re-triggers it, and
  // the Super-Admin dashboard's Active/Inactive/Never-logged-in buckets go
  // stale — everyone who hasn't re-typed their password recently reads as
  // "Never logged in" even if they used the app an hour ago. Called from
  // App.jsx's onAuthStateChange session handler on every resolved session
  // (fresh sign-in, restored session, OAuth), so it reflects real usage.
  // Fire-and-forget: never let this delay or fail app startup.
  async touchLastLogin(email) {
    if (!email) return;
    try {
      await restRpc('touch_last_login', { p_email: email });
    } catch (e) {
      console.warn('touch_last_login failed (non-fatal):', e.message || e);
    }
  },

  // Persists a client's real photo (from Google's OAuth profile) onto their
  // users row so it survives across devices/sessions instead of only living
  // in localStorage. Fire-and-forget — a failure here just means the next
  // login falls back to the Gravatar/initials Avatar renders in the meantime.
  async updateUserAvatarUrl(email, avatarUrl) {
    if (!email || !avatarUrl) return;
    try {
      const rows = await restSelect(`users?email=eq.${encodeURIComponent(email.trim().toLowerCase())}&select=id,avatar_url`);
      const user = Array.isArray(rows) && rows[0] ? rows[0] : null;
      // Don't clobber a photo the user already has saved with a stale one.
      if (user && user.avatar_url !== avatarUrl) {
        await restUpdate(`users?id=eq.${encodeURIComponent(user.id)}`, { avatar_url: avatarUrl });
      }
    } catch (e) {
      console.warn('updateUserAvatarUrl failed (non-fatal):', e.message || e);
    }
  },

  async signInWithGoogle() {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    
    // Explicitly wipe lingering session state for a clean slate
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Signout prior to Google sign-in was skipped or not needed:", e);
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: 'select_account'
        }
      }
    });
    if (error) throw error;
    return data;
  },

  async resetPassword(email) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.resetPasswordForEmail((email || '').trim().toLowerCase(), {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    return data;
  },

  async updatePassword(newPassword) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
    return data;
  },

  async sendOTP(phone) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: phone
    });
    if (error) throw error;
    return data;
  },

  async verifyOTP(phone, token) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms'
    });
    if (error) throw error;
    return data;
  },

  async verifyEmailOTP(email, token) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
  },

  async getSession() {
    if (isSupabaseConfigured && supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    }
    return null;
  },

  async getUserProfileByEmail(email) {
    if (!email) return null;
    // Look up by normalized email so a case-variant (Foo@x.com) resolves to the same
    // profile as foo@x.com instead of missing and spawning a duplicate.
    email = email.trim().toLowerCase();
    const isSuperAdminEmail = email === 'subodhmankala@gmail.com';

    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (SDK-hang bypass, same as restSelect elsewhere in this
        // file) — this specific lookup runs synchronously on every login,
        // right after a fresh auth session is established (SIGNED_IN, see
        // App.jsx processSessionUser). A fresh session is exactly when the
        // SDK's .from().select() hangs/fails while its token refresh is in
        // flight — which used to make this call silently return null for a
        // real, existing user. The caller then treated "lookup failed" as
        // "brand-new user": routed them into onboarding AND wrote a fresh
        // profile with coach_id: null over their real row (upsert on
        // user_id), deleting their actual coach link. Confirmed 2026-07-26
        // via a client whose password-reset login hit exactly this path.
        const userRows = await restSelect(`users?email=eq.${encodeURIComponent(email)}&select=*`);
        let user = Array.isArray(userRows) && userRows[0] ? userRows[0] : null;
        let coach = null;
        let client = null;
        let resolvedServerSide = false;
        // The attached coach's display name, resolved server-side alongside
        // the profile. Captured here so login persists it directly instead of
        // depending on a separate getCoachNameById() lookup, whose own
        // RLS-blanked reads left the header rendering the raw coach UUID (or
        // the bare "Coach" placeholder) with no reliable retry.
        let resolvedCoachName = null;

        // Zero rows here is AMBIGUOUS: it means either "no such account" or
        // "RLS refused this read". RLS does not error on an unauthorized
        // read — it returns an empty array — and the read above goes out with
        // the anon key whenever no authenticated token exists yet, which is
        // exactly the state every fresh login passes through. Trusting the
        // empty result is what kept sending fully-onboarded returning clients
        // back through the 4-step wizard on every single login, no matter what
        // onboarding_completed said in the database.
        //
        // So don't trust it: ask the server, which reads with the service-role
        // key and is therefore immune to RLS, to the SDK's token-refresh hang,
        // and to whichever of those races won this time. Only a `found: false`
        // from there means the account genuinely doesn't exist.
        if (!user) {
          const serverProfile = await lookupProfileViaServer(email);
          if (serverProfile?.found && serverProfile.user) {
            user = serverProfile.user;
            coach = serverProfile.coach || null;
            client = serverProfile.client || null;
            resolvedCoachName = serverProfile.coachName || null;
            resolvedServerSide = true;
          }
        }

        if (user) {
          if (!resolvedServerSide) {
            const [coachRows, clientRows] = await Promise.all([
              restSelect(`coaches?user_id=eq.${encodeURIComponent(user.id)}&select=*`),
              restSelect(`clients?user_id=eq.${encodeURIComponent(user.id)}&select=*`)
            ]);
            coach = Array.isArray(coachRows) && coachRows[0] ? coachRows[0] : null;
            client = Array.isArray(clientRows) && clientRows[0] ? clientRows[0] : null;

            // Same ambiguity one level down: the users row came back, but the
            // clients row (which carries onboarding_completed) can still be
            // RLS-blanked on its own. A user with no clients AND no coaches
            // row is the exact shape that reads as "never onboarded", so
            // re-resolve it server-side before believing that.
            if (!coach && !client) {
              const serverProfile = await lookupProfileViaServer(email);
              if (serverProfile?.found) {
                coach = serverProfile.coach || null;
                client = serverProfile.client || null;
                resolvedCoachName = serverProfile.coachName || null;
              }
            }
          }

          // No more coach approval/pending: any coaches row = an active coach.
          let activeRole = 'client';
          if (isSuperAdminEmail) {
            activeRole = 'super-admin';
          } else if (coach) {
            activeRole = 'coach';
          } else if (client) {
            activeRole = 'client';
          }

          localStorage.setItem('userRole', activeRole);
          if (coach) localStorage.setItem('userCoachId', coach.id);
          // Client stores their coach's ID — must remove (not stringify-null) when unset,
          // since localStorage.setItem(key, null) stores the literal truthy string "null".
          if (client) {
            if (client.coach_id) localStorage.setItem('userCoachId', client.coach_id);
            else localStorage.removeItem('userCoachId');
          }
          if (client) localStorage.setItem('userClientId', client.id);

          // Client has a coach but the name wasn't resolved above (the
          // client row came back from the direct read, so the server path
          // that carries coachName never ran). Ask the server for just that.
          if (!resolvedCoachName && client?.coach_id) {
            const serverProfile = await lookupProfileViaServer(email);
            resolvedCoachName = serverProfile?.coachName || null;
          }
          if (resolvedCoachName) localStorage.setItem('userCoachName', resolvedCoachName);

          return {
            id: user.id,
            coachName: resolvedCoachName,
            // A coach has no client row, so this used to fall straight to
            // coach.brand_name (their business/specialization name) instead of
            // their own name — e.g. showing "Strength & Conditioning" where
            // the coach's actual name ("lilly") should appear. users.full_name
            // is set for coaches too (register-coach.js writes it), so check
            // that before falling back to branding.
            userName: client?.full_name || user.full_name || coach?.brand_name || user.email.split('@')[0],
            // Real photo (Google OAuth `avatar_url`, or whatever a previous
            // login already saved here) — Avatar.jsx falls back to a
            // Gravatar lookup by email, then to initials, when this is null.
            userAvatarUrl: user.avatar_url || null,
            userAge: client?.age ? String(client.age) : '',
            userHeight: client?.height_cm ? String(client.height_cm) : '',
            userWeight: client?.weight_kg ? String(client.weight_kg) : '',
            userActivity: client?.activity_level || '',
            userGoal: client?.fitness_goal || '',
            userIssue: client?.issue || '',
            userDiet: client?.dietary_preference || '',
            userCalorieTarget: client?.calorie_target ? String(client.calorie_target) : '',
            userProteinTarget: client?.protein_target ? String(client.protein_target) : '',
            userCarbsTarget: client?.carbs_target ? String(client.carbs_target) : '',
            userFatsTarget: client?.fats_target ? String(client.fats_target) : '',
            role: activeRole,
            // client?.phone_number is the client's own number; a coach has no
            // client row, so falls to users.phone (coaches.saveCoachSelfProfile
            // writes there — see CoachProfile.jsx).
            phone: client?.phone_number || user.phone || '',
            brand: coach?.brand_name || 'Fit Engineers',
            // Coach-only business fields, written by saveCoachSelfProfile.
            // Blank ('') for clients since `coach` is always null for them.
            specialization: coach?.specialization || '',
            certifications: coach?.certifications || '',
            experienceYears: coach?.experience_years != null ? String(coach.experience_years) : '',
            locationCity: coach?.location_city || '',
            socialHandle: coach?.social_media_handle || '',
            payment_status: 'active',
            coach_id: client?.coach_id || null,
            userCoachId: coach?.id || null,
            userClientId: client?.id || null,
            coachIsBlocked: coach?.is_blocked === true,
            program: client?.program || null,
            primaryConcern: client?.primary_concern || null,
            primary_concern: client?.primary_concern || null,
            onboardingCompleted: client?.onboarding_completed === true,
            onboarding_completed: client?.onboarding_completed ?? false,
            verified: activeRole === 'coach' || activeRole === 'super-admin'
          };
        }
      } catch (e) {
        console.error('Cloud DB Fetch Error by email:', e);
      }
    }

    // Local Mock database check
    const mockUsers = this.getMockTable('users');
    const mUser = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (mUser || isSuperAdminEmail) {
      const userId = mUser?.id || 'mock-admin-uid';
      const mockCoaches = this.getMockTable('coaches');
      const mockClients = this.getMockTable('clients');

      const mCoach = mockCoaches.find(c => c.user_id === userId);
      const mClient = mockClients.find(c => c.user_id === userId);

      // No more coach approval/pending: any coaches row = an active coach.
      let activeRole = 'client';
      if (isSuperAdminEmail) {
        activeRole = 'super-admin';
      } else if (mCoach) {
        activeRole = 'coach';
      } else if (mClient) {
        activeRole = 'client';
      }

      localStorage.setItem('userRole', activeRole);
      if (mCoach) localStorage.setItem('userCoachId', mCoach.id);
      if (mClient) {
        if (mClient.coach_id) localStorage.setItem('userCoachId', mClient.coach_id);
        else localStorage.removeItem('userCoachId');
      }
      if (mClient) localStorage.setItem('userClientId', mClient.id);

      return {
        id: userId,
        userName: mClient?.full_name || mUser?.full_name || mCoach?.brand_name || email.split('@')[0],
        userAge: mClient?.age ? String(mClient.age) : '',
        userHeight: mClient?.height_cm ? String(mClient.height_cm) : '',
        userWeight: mClient?.weight_kg ? String(mClient.weight_kg) : '',
        userActivity: mClient?.activity_level || '',
        userGoal: mClient?.fitness_goal || '',
        userIssue: mClient?.issue || '',
        userDiet: mClient?.dietary_preference || '',
        userCalorieTarget: mClient?.calorie_target ? String(mClient.calorie_target) : '',
        userProteinTarget: mClient?.protein_target ? String(mClient.protein_target) : '',
        userCarbsTarget: mClient?.carbs_target ? String(mClient.carbs_target) : '',
        userFatsTarget: mClient?.fats_target ? String(mClient.fats_target) : '',
        role: activeRole,
        phone: mClient?.phone_number || mUser?.phone || '',
        brand: mCoach?.brand_name || 'Fit Engineers',
        specialization: mCoach?.specialization || '',
        certifications: mCoach?.certifications || '',
        experienceYears: mCoach?.experience_years != null ? String(mCoach.experience_years) : '',
        locationCity: mCoach?.location_city || '',
        socialHandle: mCoach?.social_media_handle || '',
        payment_status: 'active',
        coach_id: mClient?.coach_id || null,
        userCoachId: mCoach?.id || null,
        userClientId: mClient?.id || null,
        coachIsBlocked: mCoach?.is_blocked === true,
        program: mClient?.program || null,
        primaryConcern: mClient?.primary_concern || null,
        primary_concern: mClient?.primary_concern || null,
        onboardingCompleted: mClient?.onboarding_completed === true,
        onboarding_completed: mClient?.onboarding_completed ?? false,
        verified: activeRole === 'coach' || activeRole === 'super-admin'
      };
    }

    return null;
  },

  async loadProfileIntoLocalStorage(profile, email) {
    localStorage.setItem('userName', profile.userName || 'Trainer');
    localStorage.setItem('userEmail', email);
    if (profile.id) localStorage.setItem('userId', profile.id);
    // Real Google/Gmail photo, if this account has one saved (Avatar.jsx
    // falls back to Gravatar-by-email, then initials, when this is absent).
    if (profile.userAvatarUrl) localStorage.setItem('userAvatarUrl', profile.userAvatarUrl);
    else localStorage.removeItem('userAvatarUrl');
    if (profile.userCoachId) localStorage.setItem('userCoachId', profile.userCoachId);
    if (profile.userClientId) localStorage.setItem('userClientId', profile.userClientId);
    if (profile.userAge) localStorage.setItem('userAge', profile.userAge);
    if (profile.userHeight) localStorage.setItem('userHeight', profile.userHeight);
    if (profile.userWeight) localStorage.setItem('userWeight', profile.userWeight);
    if (profile.userActivity) localStorage.setItem('userActivity', profile.userActivity);
    if (profile.userGoal) localStorage.setItem('userGoal', profile.userGoal);
    if (profile.userIssue) localStorage.setItem('userIssue', profile.userIssue);
    if (profile.userDiet) localStorage.setItem('userDiet', profile.userDiet);
    if (profile.userCalorieTarget) localStorage.setItem('userCalorieTarget', profile.userCalorieTarget);
    if (profile.userProteinTarget) localStorage.setItem('userProteinTarget', profile.userProteinTarget);
    if (profile.userFatsTarget) localStorage.setItem('userFatsTarget', profile.userFatsTarget);
    if (profile.role) localStorage.setItem('userRole', profile.role);
    if (profile.phone) localStorage.setItem('userPhone', profile.phone);
    if (profile.brand) localStorage.setItem('userBrand', profile.brand);
    if (profile.payment_status) localStorage.setItem('userPaymentStatus', profile.payment_status);
    if (profile.coach_id) localStorage.setItem('userCoachId', profile.coach_id);
    // Persist the coach's display name resolved during the profile lookup, so
    // the dashboard header shows a real name immediately instead of falling
    // back to the "Coach" placeholder (or, before this, the raw coach UUID).
    if (profile.coachName) localStorage.setItem('userCoachName', profile.coachName);
    // Store onboarding wizard flags (support both camelCase and snake_case callers)
    const isOnboardingDone = profile.onboardingCompleted === true || profile.onboarding_completed === true;
    localStorage.setItem('onboardingWizardCompleted', isOnboardingDone ? 'true' : 'false');
    localStorage.setItem('onboardingCompleted', isOnboardingDone ? 'true' : 'false');
    if (profile.program) localStorage.setItem('userProgram', profile.program);
    if (profile.primaryConcern) localStorage.setItem('userPrimaryConcern', profile.primaryConcern);
    if (profile.primary_concern) localStorage.setItem('userPrimaryConcern', profile.primary_concern);
    localStorage.setItem('onboardingComplete', 'true');
  },

  // ─── CLIENT ONBOARDING WIZARD ───
  async saveClientOnboardingData({ age, weight_kg, height_cm, program, activity_level, primary_concern, full_name, phone }) {
    const userId = localStorage.getItem('userId');

    // Persist the client's real name locally right away so the dashboard header
    // stops showing the "Warrior" default. Only a real, non-placeholder value.
    const cleanName = (full_name || '').trim();
    if (cleanName && cleanName.toLowerCase() !== 'warrior') {
      localStorage.setItem('userName', cleanName);
    }
    const cleanPhone = (phone || '').trim();
    if (cleanPhone) localStorage.setItem('userPhone', cleanPhone);

    // Update localStorage immediately
    if (age) localStorage.setItem('userAge', String(age));
    if (weight_kg) localStorage.setItem('userWeight', String(weight_kg));
    if (height_cm) localStorage.setItem('userHeight', String(height_cm));
    if (activity_level) localStorage.setItem('userActivity', activity_level);
    if (program) localStorage.setItem('userProgram', program);
    if (primary_concern) localStorage.setItem('userPrimaryConcern', primary_concern);
    localStorage.setItem('onboardingCompleted', 'true');

    // Map program → fitness_goal for existing dashboard compatibility
    const goalMap = {
      fat_loss: 'Fat Loss',
      muscle_building: 'Muscle Building',
      gut_repair: 'Gut Health'
    };
    const mappedGoal = goalMap[program] || program || 'Fat Loss';
    localStorage.setItem('userGoal', mappedGoal);

    // Map activity_level → existing activity strings
    const activityMap = {
      sedentary: 'Sedentary',
      lightly_active: 'Lightly Active',
      moderately_active: 'Moderately Active',
      very_active: 'Very Active'
    };
    const mappedActivity = activityMap[activity_level] || activity_level || 'Moderately Active';
    localStorage.setItem('userActivity', mappedActivity);

    // Recompute macro targets from the values the client actually entered. Without
    // this, the Calories/Protein cards keep showing the signup seed defaults
    // (e.g. 2000 kcal / 120 g) regardless of what the client picked in the wizard.
    const targets = calculateTargetsGeneric(weight_kg, height_cm, age, mappedActivity, mappedGoal);
    localStorage.setItem('userCalorieTarget', String(targets.calories));
    localStorage.setItem('userProteinTarget', String(targets.protein));
    localStorage.setItem('userCarbsTarget', String(targets.carbs));
    localStorage.setItem('userFatsTarget', String(targets.fats));

    // Columns the coach dashboard reads — these have existed since the original
    // schema, so they must save even if the newer wizard-only columns below fail.
    const coreStats = {
      fitness_goal: mappedGoal,
      activity_level: mappedActivity,
      calorie_target: targets.calories,
      protein_target: targets.protein,
      carbs_target: targets.carbs,
      fats_target: targets.fats
    };
    if (age) coreStats.age = parseInt(age);
    if (weight_kg) coreStats.weight_kg = parseFloat(weight_kg);
    if (height_cm) coreStats.height_cm = parseFloat(height_cm);
    if (cleanPhone) coreStats.phone_number = cleanPhone;

    if (isSupabaseConfigured && supabase) {
      try {
        // Best-effort local id — resolveCanonicalUserId() normalizes email
        // the same way every other lookup in this file does (a case/
        // whitespace mismatch used to make this throw "Cannot resolve
        // userId for onboarding save" for a real, existing client, confirmed
        // 2026-07-27). Not required to proceed though: complete-onboarding
        // below can resolve (or create) the row itself from email alone.
        const resolvedUserId = userId || await resolveCanonicalUserId();
        const email = (localStorage.getItem('userEmail') || '').trim().toLowerCase();

        if (!resolvedUserId && !email) throw new Error('Cannot resolve your account — please log in again.');

        // Write core stats + onboarding_completed/program/primary_concern in
        // one atomic, service-role server call — this ALSO resolves/creates
        // the users+clients row server-side when resolvedUserId is empty
        // (a brand-new signup), rather than depending on App.jsx's
        // background SIGNED_IN listener having already won that race, or
        // routing that creation through the browser Supabase SDK, which is
        // known to hang right after a fresh auth session (exactly the state
        // a client is in moments after signing up — confirmed 2026-07-27 for
        // a real client, Nikhil, stuck on an indefinite spinner here when an
        // earlier version of this fix tried creating the row client-side).
        const resp = await fetch('/api/complete-onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: resolvedUserId || null, email, coreStats, program, primary_concern, full_name: cleanName })
        });
        const saveData = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(saveData.error || 'Failed to save onboarding data.');
        }

        // Cache the id the server resolved/created — for a brand-new signup
        // this is the first time the browser learns it, and every later read
        // (dashboard logs, coach connection) keys off localStorage.userId.
        if (saveData?.client?.user_id) localStorage.setItem('userId', saveData.client.user_id);

        console.log('Cloud DB: Saved onboarding wizard data.');
      } catch (e) {
        console.error('Cloud DB: Failed to save onboarding data:', e);
        throw e;
      }
    } else {
      // Mock DB update
      const mockClients = this.getMockTable('clients');
      const mClient = mockClients.find(c => c.user_id === userId);
      if (mClient) {
        Object.assign(mClient, coreStats);
        mClient.onboarding_completed = true;
        mClient.program = program || null;
        mClient.primary_concern = primary_concern || null;
        if (cleanName && cleanName.toLowerCase() !== 'warrior') mClient.full_name = cleanName;
        this.saveMockTable('clients', mockClients);
      }
    }
  },

  async getAllUsers() {
    const loggedInEmail = localStorage.getItem('userEmail');
    const loggedInRole = localStorage.getItem('userRole');
    const loggedInCoachId = localStorage.getItem('userCoachId');

    // Declared outside the try block (not `let`/`const` inside it) so the
    // RLS-fallback in the catch block below can still see which coach this
    // read was actually scoped to.
    let coachFilter;
    let ownResolvedId;
    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST read (bypasses the hanging SDK — see
        // feedback-supabase-sdk-hang memory). clients has two FKs to users
        // (user_id and coach_id), so the embed must specify which
        // relationship to follow or PostgREST rejects the query as ambiguous
        // (PGRST201) — here we want the client's own user row.
        //
        // PRIVACY: this must never fall through to an unfiltered query just
        // because loggedInRole is momentarily empty/unresolved (e.g. a brief
        // window right after login/reload before localStorage.userRole is
        // written) — that previously showed a coach every other coach's
        // clients during that window. Only a *confirmed* super-admin/admin
        // role gets the unfiltered view; a confirmed coach gets their own
        // coach_id filter; anything else (including "don't know yet")
        // returns nothing rather than guessing permissively.
        const isSuperAdminRole = loggedInRole === 'super-admin' || loggedInRole === 'admin';
        // Captured regardless of branch — the super-admin IS also a coach
        // with their own attached clients (TrainerDashboard's "My Clients"
        // filters everyone, admin included, down to their own coach_id — see
        // filteredClients), so the RLS-empty-read fallback below needs this
        // id even on the unfiltered super-admin branch, not just the
        // explicit coach one.
        ownResolvedId = await resolveCanonicalUserId();
        if (isSuperAdminRole) {
          coachFilter = '';
        } else if (loggedInRole === 'coach') {
          // Resolve the coach's canonical public.users.id by email rather than
          // trusting localStorage.userId, which can be null/poisoned right after
          // login (see resolveCanonicalUserId). A wrong or missing id here would
          // otherwise silently return the wrong client set. Fail CLOSED if it
          // still can't be determined.
          if (!ownResolvedId) return [];
          coachFilter = `&coach_id=eq.${encodeURIComponent(ownResolvedId)}`;
        } else {
          return [];
        }
        // Falls back to the plain (no last_login) embed if the migration in
        // sql/last_login_tracking.sql hasn't been run yet on this database —
        // must never let a missing optional column take down the whole
        // clients list.
        let data;
        try {
          data = await restSelect(
            `clients?select=*,users!clients_user_id_fkey(email,last_login,role)${coachFilter}`
          );
        } catch (e) {
          if (String(e.message).includes('400')) {
            data = await restSelect(
              `clients?select=*,users!clients_user_id_fkey(email,role)${coachFilter}`
            );
          } else {
            throw e;
          }
        }

        // A clients row can outlive its owner's actual role — e.g. someone
        // signed up as a client, was later approved as a coach (or promoted
        // to admin), and the old clients row was never cleaned up. Without
        // this filter, "My Clients"/"All Clients" silently counted coaches
        // as clients, disagreeing with getPlatformStats' totalActiveClients
        // (which correctly counts from users.role='client') by exactly the
        // number of such stale rows. Confirmed 2026-08-12: 2 real coach
        // accounts (role='coach' in users) still had a leftover clients row,
        // making "My Clients (37)" and "Total Clients: 36" disagree.
        // `c.users` can be null if the join genuinely found nothing (RLS/
        // deleted user) — don't drop those, only drop a CONFIRMED non-client.
        if (Array.isArray(data)) {
          data = data.filter((c) => !c.users?.role || c.users.role === 'client');
        }

        // Zero rows is ambiguous — genuinely no clients, or the
        // RLS-vs-anon-key gap this whole file works around elsewhere. This is
        // the function that actually powers "My Clients" (TrainerDashboard
        // has no separate call), and it had no fallback at all — confirmed
        // 2026-08-10 for a real coach (the super-admin account itself) with
        // real attached clients (verified directly against the DB) who still
        // saw "No Clients Found". This must fire for BOTH branches: the
        // explicit-coach branch (coachFilter set) AND the super-admin
        // unfiltered branch (coachFilter === '' — the whole-platform read can
        // hit the exact same RLS gap). Using ownResolvedId rather than
        // re-parsing coachFilter covers both; TrainerDashboard's
        // filteredClients narrows everyone, admin included, down to their own
        // coach_id anyway (see its 'viewMode === coach' filter), so scoping
        // this fallback to the caller's own id is correct for what "My
        // Clients" actually renders in both cases.
        if (Array.isArray(data) && data.length === 0 && ownResolvedId) {
          const serverClients = await getCoachClientsViaServer(ownResolvedId);
          if (serverClients && serverClients.length > 0) data = serverClients;
        }

        if (data) {
          return data.map(c => ({
            id: c.user_id, // Keep user_id as id for workout_logs/chats compatibility
            client_id: c.id,
            email: c.users?.email || '',
            userName: c.full_name,
            userAge: String(c.age || ''),
            userHeight: String(c.height_cm || ''),
            userWeight: String(c.weight_kg || ''),
            userActivity: c.activity_level || '',
            userGoal: c.fitness_goal || '',
            userDiet: c.dietary_preference || '',
            userCalorieTarget: String(c.calorie_target || ''),
            userProteinTarget: String(c.protein_target || ''),
            userCarbsTarget: String(c.carbs_target || ''),
            userFatsTarget: String(c.fats_target || ''),
            role: 'client',
            phone: c.phone_number,
            last_login: c.users?.last_login || null,
            coach_id: c.coach_id,
            total_sessions: c.total_sessions ?? null,
            total_sessions_updated_at: c.total_sessions_updated_at ?? null,
            program_started_on: c.program_started_on ?? null,
            program_est_completion: c.program_est_completion ?? null, joined_at: c.created_at || null
          }));
        }
      } catch (e) {
        console.error('Cloud DB Fetch all clients error:', e);
        {
          const filterCoachId = ownResolvedId || (coachFilter
            ? decodeURIComponent((coachFilter.match(/coach_id=eq\.([^&]+)/) || [])[1] || '')
            : null);
          if (filterCoachId) {
            const serverClients = await getCoachClientsViaServer(filterCoachId);
            if (serverClients) {
              return serverClients.map(c => ({
                id: c.user_id,
                client_id: c.id,
                email: c.users?.email || '',
                userName: c.full_name,
                userAge: String(c.age || ''),
                userHeight: String(c.height_cm || ''),
                userWeight: String(c.weight_kg || ''),
                userActivity: c.activity_level || '',
                userGoal: c.fitness_goal || '',
                userDiet: c.dietary_preference || '',
                userCalorieTarget: String(c.calorie_target || ''),
                userProteinTarget: String(c.protein_target || ''),
                userCarbsTarget: String(c.carbs_target || ''),
                userFatsTarget: String(c.fats_target || ''),
                role: 'client',
                phone: c.phone_number,
                last_login: c.users?.last_login || null,
                coach_id: c.coach_id,
                total_sessions: c.total_sessions ?? null,
            total_sessions_updated_at: c.total_sessions_updated_at ?? null,
            program_started_on: c.program_started_on ?? null,
            program_est_completion: c.program_est_completion ?? null, joined_at: c.created_at || null
              }));
            }
          }
        }
      }
    }

    // Local Storage Fallback — same privacy rule as above: only a confirmed
    // super-admin/admin role sees everything; a confirmed coach sees only
    // their own; anything else returns nothing.
    const mockClients = this.getMockTable('clients');
    const mockUsers = this.getMockTable('users');
    const loggedInUserId = localStorage.getItem('userId');

    let filtered;
    if (loggedInRole === 'super-admin' || loggedInRole === 'admin') {
      filtered = mockClients;
    } else if (loggedInRole === 'coach' && (loggedInCoachId || loggedInUserId)) {
      filtered = mockClients.filter(c => c.coach_id === loggedInCoachId || c.coach_id === loggedInUserId);
    } else {
      filtered = [];
    }

    return filtered.map(c => {
      const u = mockUsers.find(user => user.id === c.user_id);
      return {
        id: c.user_id,
        client_id: c.id,
        email: u?.email || `${c.full_name.toLowerCase().replace(/\s+/g, '')}@fitengineers.com`,
        userName: c.full_name,
        userAge: String(c.age || ''),
        userHeight: String(c.height_cm || ''),
        userWeight: String(c.weight_kg || ''),
        userActivity: c.activity_level || '',
        userGoal: c.fitness_goal || '',
        userDiet: c.dietary_preference || '',
        userCalorieTarget: String(c.calorie_target || ''),
        userProteinTarget: String(c.protein_target || ''),
        userCarbsTarget: String(c.carbs_target || ''),
        userFatsTarget: String(c.fats_target || ''),
        role: 'client',
        phone: c.phone_number,
        last_login: u?.last_login || null,
        coach_id: c.coach_id,
        total_sessions: c.total_sessions ?? null,
        total_sessions_updated_at: c.total_sessions_updated_at ?? null,
        program_started_on: c.program_started_on ?? null,
        program_est_completion: c.program_est_completion ?? null, joined_at: c.created_at || null
      };
    });
  },

  // Used by the Platform Admin "Coaches Directory" drill-down. Deliberately
  // mirrors getAllUsers()'s coach-filtered query exactly (same table, same
  // coach_id equality, same field mapping) so the admin view and a coach's
  // own "My Clients" list can never disagree about who's attached to whom.
  async getClientsForCoach(coachId) {
    if (!coachId) return [];

    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (SDK-hang/RLS bypass, same as restSelect elsewhere in
        // this file) instead of supabase.from('clients').select() — the SDK
        // call runs under whatever session state the SDK client currently
        // holds, which is the same stale/null-auth.uid() failure mode
        // documented on restSelect above. Because this SELECT's RLS policy
        // just filters rows rather than erroring, that failure mode was
        // silent here: a real coach with real clients got back an empty
        // array (200 OK, zero rows) instead of an error, so "My Clients"
        // always showed 0 (2026-08-09). Same last_login-column-might-not-exist-yet
        // fallback as getAllUsers.
        let data;
        try {
          data = await restSelect(`clients?select=*,users!clients_user_id_fkey(email,last_login)&coach_id=eq.${encodeURIComponent(coachId)}`);
        } catch (e) {
          if (String(e.message || '').includes('42703')) {
            data = await restSelect(`clients?select=*,users!clients_user_id_fkey(email)&coach_id=eq.${encodeURIComponent(coachId)}`);
          } else {
            throw e;
          }
        }

        // Empty is ambiguous — genuinely no clients, or the RLS-vs-anon-key
        // gap documented above. This exact case was already diagnosed in the
        // comment above (2026-08-09: "My Clients always showed 0") but never
        // got a fallback, only the retry-less direct read. Confirm with the
        // service-role-backed endpoint before believing "zero clients".
        if (Array.isArray(data) && data.length === 0) {
          const serverClients = await getCoachClientsViaServer(coachId);
          if (serverClients && serverClients.length > 0) data = serverClients;
        }

        if (data) {
          return data.map(c => ({
            id: c.user_id,
            client_id: c.id,
            email: c.users?.email || '',
            userName: c.full_name,
            userAge: String(c.age || ''),
            userHeight: String(c.height_cm || ''),
            userWeight: String(c.weight_kg || ''),
            userActivity: c.activity_level || '',
            userGoal: c.fitness_goal || '',
            userDiet: c.dietary_preference || '',
            userCalorieTarget: String(c.calorie_target || ''),
            userProteinTarget: String(c.protein_target || ''),
            userCarbsTarget: String(c.carbs_target || ''),
            userFatsTarget: String(c.fats_target || ''),
            role: 'client',
            phone: c.phone_number,
            last_login: c.users?.last_login || null,
            coach_id: c.coach_id,
            total_sessions: c.total_sessions ?? null,
            total_sessions_updated_at: c.total_sessions_updated_at ?? null,
            program_started_on: c.program_started_on ?? null,
            program_est_completion: c.program_est_completion ?? null, joined_at: c.created_at || null
          }));
        }
      } catch (e) {
        console.error('Cloud DB Fetch clients for coach error:', e);
        const serverClients = await getCoachClientsViaServer(coachId);
        if (serverClients) {
          return serverClients.map(c => ({
            id: c.user_id,
            client_id: c.id,
            email: c.users?.email || '',
            userName: c.full_name,
            userAge: String(c.age || ''),
            userHeight: String(c.height_cm || ''),
            userWeight: String(c.weight_kg || ''),
            userActivity: c.activity_level || '',
            userGoal: c.fitness_goal || '',
            userDiet: c.dietary_preference || '',
            userCalorieTarget: String(c.calorie_target || ''),
            userProteinTarget: String(c.protein_target || ''),
            userCarbsTarget: String(c.carbs_target || ''),
            userFatsTarget: String(c.fats_target || ''),
            role: 'client',
            phone: c.phone_number,
            last_login: c.users?.last_login || null,
            coach_id: c.coach_id,
            total_sessions: c.total_sessions ?? null,
            total_sessions_updated_at: c.total_sessions_updated_at ?? null,
            program_started_on: c.program_started_on ?? null,
            program_est_completion: c.program_est_completion ?? null, joined_at: c.created_at || null
          }));
        }
      }
    }

    const mockClients = this.getMockTable('clients');
    const mockUsers = this.getMockTable('users');
    return mockClients.filter(c => c.coach_id === coachId).map(c => {
      const u = mockUsers.find(user => user.id === c.user_id);
      return {
        id: c.user_id,
        client_id: c.id,
        email: u?.email || '',
        userName: c.full_name,
        userAge: String(c.age || ''),
        userHeight: String(c.height_cm || ''),
        userWeight: String(c.weight_kg || ''),
        userActivity: c.activity_level || '',
        userGoal: c.fitness_goal || '',
        userDiet: c.dietary_preference || '',
        userCalorieTarget: String(c.calorie_target || ''),
        userProteinTarget: String(c.protein_target || ''),
        userCarbsTarget: String(c.carbs_target || ''),
        userFatsTarget: String(c.fats_target || ''),
        role: 'client',
        phone: c.phone_number,
        last_login: u?.last_login || null,
        coach_id: c.coach_id,
        total_sessions: c.total_sessions ?? null,
        total_sessions_updated_at: c.total_sessions_updated_at ?? null,
        program_started_on: c.program_started_on ?? null,
        program_est_completion: c.program_est_completion ?? null, joined_at: c.created_at || null
      };
    });
  },

  // ─── COACHING PROGRAM TOTAL SESSIONS ───
  // Coach sets the program length for one attached client. Goes through the
  // SECURITY DEFINER RPC (supabase_total_sessions.sql) so the coach↔client
  // scope check happens server-side regardless of which clients RLS policy
  // set is deployed — no policy changes needed.
  async setClientTotalSessions(clientUserId, totalSessions) {
    if (!clientUserId) {
      return { success: false, error: 'Missing coach or client id.' };
    }
    const parsed = parseInt(totalSessions, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return { success: false, error: 'Total sessions must be a number of 1 or more.' };
    }

    if (isSupabaseConfigured && supabase) {
      try {
        // Goes through /api/admin-write, not a direct RPC call — the RPC's
        // own coach↔client scope check was real, but calling it straight via
        // restRpc (anon key only) meant p_coach_id was whatever the CLIENT
        // claimed, with nothing tying it to who was actually calling. This
        // endpoint verifies the caller's real session server-side and
        // resolves the coach id itself, closing that gap (confirmed
        // exploitable 2026-08-30 via a direct anon-key RPC call with an
        // arbitrary coach_id/client_id pair). See api/admin-write.js.
        const accessToken = await resolveRealAccessToken();
        if (!accessToken) {
          return { success: false, error: 'Your session could not be verified. Please sign in again.' };
        }
        const res = await fetch('/api/admin-write?action=set-client-total-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ clientUserId, totalSessions: parsed })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || (data && data.success === false)) {
          return { success: false, error: (data && data.error) || 'Update failed.' };
        }
        return { success: true, total_sessions: parsed, total_sessions_updated_at: data?.total_sessions_updated_at || new Date().toISOString() };
      } catch (e) {
        console.error('[setClientTotalSessions] error:', e);
        return { success: false, error: e.message || 'Update failed.' };
      }
    }

    // Mock fallback (offline/no Supabase configured) — same coach↔client
    // scoping as the RPC's WHERE clause. Only reached when there's no real
    // backend to talk to, so trusting localStorage's own id here is fine —
    // there's no server-side authority to check against in this mode.
    const coachUserId = (await resolveCanonicalUserId()) || localStorage.getItem('userId');
    const mockClients = this.getMockTable('clients');
    const idx = mockClients.findIndex(c => c.user_id === clientUserId && c.coach_id === coachUserId);
    if (idx < 0) return { success: false, error: 'No matching coach-client relationship.' };
    const nowIso = new Date().toISOString();
    mockClients[idx].total_sessions = parsed;
    mockClients[idx].total_sessions_updated_at = nowIso;
    this.saveMockTable('clients', mockClients);
    return { success: true, total_sessions: parsed, total_sessions_updated_at: nowIso };
  },

  // Coach sets/edits the program's start date and estimated-completion date
  // for one attached client. Same SECURITY DEFINER RPC pattern as
  // setClientTotalSessions above (see supabase_total_sessions.sql) — the
  // coach↔client relationship is re-checked server-side on every write.
  // Either date may be null to clear it.
  async setClientProgramDates(clientUserId, startedOn, estCompletion) {
    if (!clientUserId) {
      return { success: false, error: 'Missing coach or client id.' };
    }

    if (isSupabaseConfigured && supabase) {
      try {
        // Same /api/admin-write fix as setClientTotalSessions above — the
        // caller's identity is now verified server-side instead of trusted
        // from a client-supplied p_coach_id. See api/admin-write.js.
        const accessToken = await resolveRealAccessToken();
        if (!accessToken) {
          return { success: false, error: 'Your session could not be verified. Please sign in again.' };
        }
        const res = await fetch('/api/admin-write?action=set-client-program-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ clientUserId, startedOn: startedOn || null, estCompletion: estCompletion || null })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || (data && data.success === false)) {
          return { success: false, error: (data && data.error) || 'Update failed.' };
        }
        return { success: true, program_started_on: startedOn || null, program_est_completion: estCompletion || null };
      } catch (e) {
        console.error('[setClientProgramDates] error:', e);
        return { success: false, error: e.message || 'Update failed.' };
      }
    }

    // Mock fallback (offline/no Supabase configured) — same coach↔client
    // scoping as the RPC's WHERE clause; no server-side authority to check
    // against in this mode, so trusting localStorage's id here is fine.
    const coachUserId = (await resolveCanonicalUserId()) || localStorage.getItem('userId');
    const mockClients = this.getMockTable('clients');
    const idx = mockClients.findIndex(c => c.user_id === clientUserId && c.coach_id === coachUserId);
    if (idx < 0) return { success: false, error: 'No matching coach-client relationship.' };
    mockClients[idx].program_started_on = startedOn || null;
    mockClients[idx].program_est_completion = estCompletion || null;
    this.saveMockTable('clients', mockClients);
    return { success: true, program_started_on: startedOn || null, program_est_completion: estCompletion || null };
  },

  // Client-side read of its own connection record: is a coach attached, and
  // what program length (total_sessions) did that coach set? Only ever reads
  // the logged-in user's own clients row.
  // Public wrapper so components can repair a poisoned userId before any
  // user_id-keyed read (e.g. workout logs), not just the coach-connection read.
  async resolveUserId() {
    return resolveCanonicalUserId();
  },

  async getOwnCoachConnection() {
    // Resolve (and repair) the real public.users.id first — a userId poisoned
    // with the Supabase auth UID would query a nonexistent clients row and
    // report a false "disconnected" (see resolveCanonicalUserId above).
    const userId = await resolveCanonicalUserId();
    if (!userId) return { connected: false, coachId: null, totalSessions: null, resolved: false };

    if (isSupabaseConfigured) {
      // A coach connection, once made, must not appear to drop just because a
      // request stalled — this read is competing with sign-in, profile-fetch
      // and workout-log requests that all fire at once right after login, so
      // it can genuinely fail more than once under that load. Retry a few
      // times with backoff before giving up.
      const maxAttempts = 4;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const rows = await restSelect(
            `clients?select=coach_id,total_sessions,program_started_on,program_est_completion&user_id=eq.${encodeURIComponent(userId)}&limit=1`
          );
          const data = Array.isArray(rows) ? rows[0] : null;
          if (data) {
            return {
              connected: !!data.coach_id,
              coachId: data.coach_id || null,
              totalSessions: data.total_sessions ?? null,
              programStartedOn: data.program_started_on ?? null,
              programEstCompletion: data.program_est_completion ?? null,
              resolved: true
            };
          }
          // Zero rows is ambiguous — genuinely no clients row, or RLS quietly
          // blocked the read (returns 200/[] here, never throws, so this
          // never even reached the catch block below and used to be trusted
          // outright as "not connected" on the very first try, no retry, no
          // fallback — unlike every other read in this file that has the
          // same RLS-vs-anon-key gap). Confirmed 2026-08-10: a real, actively
          // connected client (coach_id set in the DB) read back as
          // disconnected purely from this gap. Ask the service-role-backed
          // profile lookup, which is immune to RLS, before believing it.
          const email = (localStorage.getItem('userEmail') || '').trim().toLowerCase();
          if (email) {
            const serverProfile = await lookupProfileViaServer(email);
            if (serverProfile?.found) {
              const client = serverProfile.client || null;
              return {
                connected: !!client?.coach_id,
                coachId: client?.coach_id || null,
                totalSessions: client?.total_sessions ?? null,
                programStartedOn: client?.program_started_on ?? null,
                programEstCompletion: client?.program_est_completion ?? null,
                resolved: true
              };
            }
          }
          if (attempt < maxAttempts - 1) {
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          return {
            connected: localStorage.getItem('clientLinkedToCoach') === 'true',
            coachId: localStorage.getItem('userCoachId') || null,
            totalSessions: null,
            resolved: false
          };
        } catch (e) {
          console.error('[getOwnCoachConnection] error:', e);
          if (attempt < maxAttempts - 1) {
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          // Every attempt failed: this is NOT a definitive "disconnected" answer,
          // it's "we don't know yet". Callers must not treat resolved:false as
          // proof of disconnection or persist it as the cached status — doing so
          // previously poisoned the cache with a false "disconnected" that then
          // looked confirmed on every later load, even though the client was
          // (and remained) genuinely connected the whole time.
          return {
            connected: localStorage.getItem('clientLinkedToCoach') === 'true',
            coachId: localStorage.getItem('userCoachId') || null,
            totalSessions: null,
            resolved: false
          };
        }
      }
    }

    const mockClients = this.getMockTable('clients');
    const row = mockClients.find(c => c.user_id === userId);
    return {
      connected: !!row?.coach_id,
      coachId: row?.coach_id || null,
      totalSessions: row?.total_sessions ?? null,
      programStartedOn: row?.program_started_on ?? null,
      programEstCompletion: row?.program_est_completion ?? null,
      resolved: true
    };
  },

  // Auto-disconnects a client from their coach once they've completed their
  // full session package (coach_id, total_sessions → null) with no renewal —
  // renewing means the coach raised total_sessions again before this ran, so
  // completedCount is still under it. Called from the client's own app right
  // after a workout save and on the home dashboard's mount.
  //
  // Deliberately does NOT touch workout_logs/body_measurements — those are
  // keyed by user_id, never by the coach relationship, so a client's full
  // history (sessions done, reps, weights) stays fully intact and visible to
  // whichever coach they connect to next, including reconnecting to this
  // same one later via a fresh invite code.
  //
  // Returns { disconnected, oldCoachId } — oldCoachId lets the caller fire a
  // courtesy notifyEvent('client_disconnected', ...) to the coach who just
  // lost this client, since by the time that fires coach_id is already null
  // and no longer resolvable from the DB.
  async checkAndHandleSessionPackageCompletion(userId) {
    if (!isSupabaseConfigured || !supabase || !userId) return { disconnected: false };
    try {
      const conn = await this.getOwnCoachConnection();
      if (!conn.resolved || !conn.connected || !conn.coachId || !Number.isFinite(conn.totalSessions) || conn.totalSessions <= 0) {
        return { disconnected: false };
      }

      const logs = await this.getWorkoutLogsForUser(userId);
      // Scope to the CURRENT program period, same as TrainerDashboard's
      // sessions-left math (handleSendSessionReminder) — without this, a
      // client's full lifetime log count was compared against a
      // freshly-edited total_sessions. For any client with enough history
      // (e.g. a long-time client whose coach just adjusted their total),
      // that lifetime count could already meet/exceed the new total on the
      // very next dashboard load, firing an immediate, unwanted
      // auto-disconnect that nulled out coach_id AND the total_sessions the
      // coach had just set — looking exactly like the edit "didn't save".
      const datesThisProgram = conn.programStartedOn
        ? (logs || []).filter(l => l.log_date >= conn.programStartedOn)
        : (logs || []);
      const completedCount = new Set(datesThisProgram.map(l => l.log_date)).size;
      if (completedCount < conn.totalSessions) return { disconnected: false };

      const oldCoachId = conn.coachId;
      // Raw PostgREST (restUpdate) instead of supabase.from() — same
      // SDK-hang bypass as everywhere else in this file.
      try {
        await restUpdate(`clients?user_id=eq.${encodeURIComponent(userId)}`, { coach_id: null, total_sessions: null });
      } catch (error) {
        console.error('Auto-disconnect (session package complete) failed:', error);
        return { disconnected: false };
      }

      localStorage.setItem('clientLinkedToCoach', 'false');
      localStorage.removeItem('userCoachId');
      localStorage.removeItem('userCoachName');
      localStorage.removeItem('userSessionsLimit');
      // Also clear the program-dates cache — left behind before, so a client
      // who later reconnects (this coach or a new one) had
      // WorkoutProgressDashboard's initial render seed itself from the OLD
      // program_started_on/program_est_completion (see its useState
      // initializer) until its own DB reconcile overwrote it moments later.
      // WorkoutTracker.jsx has no such seed (starts null every mount), so the
      // two screens showed different "Started on"/session-remaining numbers
      // for that window — read as "the log side shows something different
      // from the home side."
      localStorage.removeItem('userProgramStartedOn');
      localStorage.removeItem('userProgramEstCompletion');
      return { disconnected: true, oldCoachId };
    } catch (e) {
      console.error('checkAndHandleSessionPackageCompletion error:', e);
      return { disconnected: false };
    }
  },

  async getWorkoutLogsForUser(userId) {
    // SECURITY: userId must be a real public.users.id (UUID). This used to
    // accept a bare display name and resolve it via
    // `users?full_name=ilike.<name>&limit=1` — an ambiguous "first match"
    // lookup. Every current caller passes a genuine UUID EXCEPT two call
    // sites that used to fall back to a cached display name (often the
    // literal placeholder "Warrior", shared by every client who hasn't set a
    // real name yet) whenever id resolution raced with login and failed.
    // That returned an arbitrary OTHER "Warrior"-named client's private
    // workout_logs to the logged-in user — a real cross-account data leak,
    // confirmed 2026-07-09. Never resolve a name to an id here again; a
    // non-UUID input fails closed (no logs) instead of guessing.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId || '');
    if (!isUuid) return [];

    if (isSupabaseConfigured) {
      try {
        // Raw PostgREST read (bypasses the hanging SDK).
        const data = await restSelect(
          `workout_logs?select=*&user_id=eq.${encodeURIComponent(userId)}` +
          `&order=log_date.desc,exercise_name.asc,set_number.asc`
        );
        if (Array.isArray(data) && data.length > 0) return data;
        // Empty is ambiguous — genuinely zero logs, or the session token
        // wasn't ready/valid when this fired (same RLS-vs-anon-key gap as
        // getUserProfileByEmail, on this table). Confirm with the
        // service-role-backed endpoint before believing "no history".
        const serverLogs = await getWorkoutLogsViaServer(userId);
        return serverLogs ?? [];
      } catch (e) {
        console.error('Cloud DB Fetch workout logs error:', e);
        const serverLogs = await getWorkoutLogsViaServer(userId);
        if (serverLogs) return serverLogs;
      }
    }

    // Offline local storage fallback - check client-specific key first, then global
    const keyPrefix = `client_${userId}_`;
    const clientSpecific = localStorage.getItem(`${keyPrefix}workoutSessions`);
    const globalSessions = localStorage.getItem('workoutSessions');
    
    // Try client-specific store first, then fallback to global filtered by clientName or userId
    const stored = clientSpecific || globalSessions;
    if (stored) {
      try {
        const sessions = JSON.parse(stored);
        const flatLogs = [];
        sessions.forEach(sess => {
          // Match by: clientName cleaned matches userId, or if this is client-specific store (no filter needed)
          const sessionClientKey = sess.clientName
            ? sess.clientName.toLowerCase().replace(/\s+/g, '')
            : '';
          const isMatch = clientSpecific // if using client-specific store, include all
            || sessionClientKey === userId.toLowerCase()
            || (sess.clientId && sess.clientId === userId);
          
          if (isMatch && sess.exercises) {
            sess.exercises.forEach(ex => {
              if (ex.sets) {
                const exIsCardio = isCardioExercise(ex.name);
                const exIsTimed = isTimedExercise(ex.name);
                // See the saveWorkoutSession comment above — Foot Fires keeps
                // a real weight_kg even though it's also isTimedExercise.
                const exIsTimedBodyweight = exIsTimed && isBodyweightExercise(ex.name);
                ex.sets.forEach((set, sIdx) => {
                  flatLogs.push({
                    log_date: sess.date,
                    exercise_name: ex.name,
                    set_number: sIdx + 1,
                    reps: (exIsCardio || exIsTimed) ? 0 : parseInt(set.reps || '0'),
                    weight_kg: (exIsCardio || (exIsTimed && !exIsTimedBodyweight)) ? 0 : parseFloat(set.weight || '0.0'),
                    plan_name: sess.planName || 'Custom Routine',
                    ...(exIsCardio ? {
                      distance_km: parseFloat(set.distanceKm || '0') || 0,
                      cardio_duration_seconds: parseTimeStringToSeconds(set.time)
                    } : exIsTimed ? {
                      cardio_duration_seconds: parseTimeStringToSeconds(set.time)
                    } : {})
                  });
                });
              }
            });
          }
        });
        return flatLogs;
      } catch (e) {
        console.error("Error parsing local workout sessions:", e);
      }
    }
    return [];
  },

  // ─── COACH WORKOUT SUMMARY ───
  // Recent workout activity for ONLY the clients currently attached to the
  // logged-in coach (clients.coach_id === coach's users.id). Strictly scoped:
  // generic/unattached clients (coach_id null) and other coaches' clients are
  // never included, and a client who switches coaches stops appearing here for
  // the previous coach the moment their coach_id is overwritten. Rows from
  // workout_logs are grouped into one "session" per client + local date + plan.
  async getWorkoutSummaryForCoach(limit = 25) {
    const coachUserId = localStorage.getItem('userId');
    if (!coachUserId) return [];

    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST reads (bypass the hanging SDK — see
        // feedback-supabase-sdk-hang memory).
        // 1) The coach's currently-attached clients (and their display names).
        const clientRows = await restSelect(
          `clients?select=user_id,full_name,coach_id&coach_id=eq.${encodeURIComponent(coachUserId)}`
        );
        if (!clientRows || clientRows.length === 0) return [];

        const idToName = {};
        const clientIds = [];
        clientRows.forEach(c => {
          if (c.user_id) { idToName[c.user_id] = c.full_name || 'Client'; clientIds.push(c.user_id); }
        });
        if (clientIds.length === 0) return [];

        // 2) Recent logs for ONLY those client ids — the scope is enforced here in
        //    the query (workout_logs has no coach_id and RLS is permissive).
        const idList = clientIds.map(encodeURIComponent).join(',');
        const logs = await restSelect(
          `workout_logs?select=user_id,log_date,plan_name,exercise_name,set_number,reps,weight_kg,created_at` +
          `&user_id=in.(${idList})&order=log_date.desc,created_at.desc`
        );

        // 3) Group sets into sessions: client + local log_date + plan name.
        const sessions = {};
        (logs || []).forEach(r => {
          const workoutName = r.plan_name || 'Custom Routine';
          const key = `${r.user_id}|${r.log_date}|${workoutName}`;
          if (!sessions[key]) {
            sessions[key] = {
              clientId: r.user_id,
              clientName: idToName[r.user_id] || 'Client',
              workoutName,
              date: r.log_date, // already a local-tz YYYY-MM-DD from getLocalDateString()
              exerciseNames: new Set(),
              sets: 0,
              createdAt: r.created_at || ''
            };
          }
          const s = sessions[key];
          s.exerciseNames.add(r.exercise_name);
          s.sets += 1;
          if ((r.created_at || '') > s.createdAt) s.createdAt = r.created_at || '';
        });

        return Object.values(sessions)
          .map(s => ({
            clientId: s.clientId,
            clientName: s.clientName,
            workoutName: s.workoutName,
            date: s.date,
            exercises: s.exerciseNames.size,
            sets: s.sets
          }))
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
          .slice(0, limit);
      } catch (e) {
        console.error('Cloud DB getWorkoutSummaryForCoach error:', e);
      }
    }

    return [];
  },

  // ─── SESSIONS AWAITING A COACH NOTE (home-screen prompt) ───
  // For the logged-in coach, return each attached client's MOST RECENT
  // workout session that hasn't yet been answered by a coach note — i.e. no
  // note was sent on/after that session's date. This is what powers the
  // "client finished a workout, send them a note" cards on the coach's home
  // screen (the fallback for a missed "workout completed" push). Same coach
  // scoping and PostgREST-over-SDK approach as getWorkoutSummaryForCoach.
  async getSessionsAwaitingCoachNote(coachId) {
    if (!isSupabaseConfigured || !coachId) return [];
    try {
      // 1) The coach's attached clients.
      const clientRows = await restSelect(
        `clients?select=user_id,full_name&coach_id=eq.${encodeURIComponent(coachId)}`
      );
      if (!clientRows || clientRows.length === 0) return [];
      const idToName = {};
      const clientIds = [];
      clientRows.forEach(c => {
        if (c.user_id) { idToName[c.user_id] = c.full_name || 'Client'; clientIds.push(c.user_id); }
      });
      if (clientIds.length === 0) return [];
      const idList = clientIds.map(encodeURIComponent).join(',');

      // 2) Recent sessions for those clients (session metadata is denormalized
      //    onto every set row — pick the first non-null duration/calories per
      //    session, same as groupLogs in TrainerDashboard).
      const logs = await restSelect(
        `workout_logs?select=user_id,log_date,plan_name,duration_seconds,calories_burned,created_at` +
        `&user_id=in.(${idList})&order=log_date.desc,created_at.desc`
      );
      const latestByClient = {};
      (logs || []).forEach(r => {
        const cur = latestByClient[r.user_id];
        // Rows are already date-desc, created_at-desc, so the first row seen
        // for a client is their latest session; later rows only backfill the
        // duration/calories for that same latest date.
        if (!cur) {
          latestByClient[r.user_id] = {
            clientId: r.user_id,
            clientName: idToName[r.user_id] || 'Client',
            date: r.log_date,
            workoutName: r.plan_name || 'Custom Routine',
            durationSeconds: r.duration_seconds ?? null,
            caloriesBurned: r.calories_burned ?? null,
            // When this session actually landed. Rows are created_at-desc, so
            // the first one seen is the session's latest write.
            sessionAt: r.created_at || null
          };
        } else if (cur.date === r.log_date) {
          if (cur.durationSeconds == null && r.duration_seconds != null) cur.durationSeconds = r.duration_seconds;
          if (cur.caloriesBurned == null && r.calories_burned != null) cur.caloriesBurned = r.calories_burned;
        }
      });

      // 3) Latest coach-note timestamp per client, so a session already
      //    responded to (note sent on/after that day) is filtered out.
      const noteRows = await restSelect(
        `coach_notes?select=client_id,created_at&coach_id=eq.${encodeURIComponent(coachId)}` +
        `&client_id=in.(${idList})&order=created_at.desc`
      );
      const lastNoteByClient = {};
      (noteRows || []).forEach(n => {
        if (!lastNoteByClient[n.client_id]) lastNoteByClient[n.client_id] = n.created_at;
      });

      // 4) Keep only sessions still needing a response: no note ever, or the
      //    last note predates the session itself. Compared against the
      //    session's real created_at, NOT start-of-day: a coach who'd already
      //    sent that client a note earlier the same day would otherwise have
      //    the card suppressed for every workout they finished for the rest
      //    of that day — the coach gets the "workout completed" push, taps it,
      //    and lands on a home screen with nothing to respond to. Falls back
      //    to start-of-day only for legacy rows with no created_at.
      return Object.values(latestByClient).filter(s => {
        const lastNote = lastNoteByClient[s.clientId];
        if (!lastNote) return true;
        return new Date(lastNote) < new Date(s.sessionAt || `${s.date}T00:00:00`);
      });
    } catch (e) {
      // BUG FIX 2026-08-18: this used to return [] on any failure (a slow/
      // dropped request on a weak connection included — restSelect above
      // makes three sequential network calls, any one of which can fail).
      // The home screen's "finished a workout" note composer is gated
      // entirely on this list being non-empty (sessionsAwaitingNote.length >
      // 0 in TrainerDashboard), so an empty [] here doesn't just mean "no
      // toast update" — it unmounts the whole card, textarea included, out
      // from under the coach mid-type. That's what a flaky-connection retry
      // (fired by refreshSessionsAwaitingNote on window focus/visibility,
      // which some mobile webviews trigger when the on-screen keyboard
      // opens) looked like: the composer, and whatever the coach was
      // already typing into it, vanishing to blank container background
      // with the keyboard still up. Returning null instead lets the caller
      // tell "fetch failed" apart from "genuinely nothing pending" and keep
      // showing whatever was already on screen.
      console.error('Cloud DB getSessionsAwaitingCoachNote error:', e);
      return null;
    }
  },

  // ─── RENEWAL-DUE CLIENTS (coach directory banner) ───
  // Monthly billing cadence, not session-count — "renewal" here means "paid
  // again within the last ~30 days", derived purely from client_payments.
  // Deliberately has NO separate "mark as renewed" step: logging a payment
  // (addClientPayment above) IS the renewal action, because this always
  // reads each client's MOST RECENT paid_at fresh. A coach who logs today's
  // payment sees that client drop off this list on the very next refresh —
  // no nudge, no manual toggle, nothing else to remember (2026-08-29 request:
  // "auto renewal once coach updates the payment, no nudge nothing"). Only
  // considers clients who have paid at least once; a client who's never paid
  // belongs to the separate "never paid" conversation, not a renewal one.
  async getRenewalDueClients(coachId) {
    if (!isSupabaseConfigured || !coachId) return [];
    try {
      const clientRows = await restSelect(
        `clients?select=user_id,full_name&coach_id=eq.${encodeURIComponent(coachId)}`
      );
      if (!clientRows || clientRows.length === 0) return [];
      const nameById = {};
      clientRows.forEach(c => { if (c.user_id) nameById[c.user_id] = c.full_name || 'Client'; });

      const payments = await restSelect(
        `client_payments?select=client_id,paid_at&coach_id=eq.${encodeURIComponent(coachId)}&order=paid_at.desc`
      );
      if (!payments || payments.length === 0) return [];

      // Rows are paid_at-desc, so the first one seen per client is their
      // most recent payment.
      const lastPaidByClient = {};
      payments.forEach(p => {
        if (!lastPaidByClient[p.client_id]) lastPaidByClient[p.client_id] = p.paid_at;
      });

      const MONTH_DAYS = 30;
      // Surfaces 5 days ahead of the due date so a coach has time to actually
      // have the conversation, not just a same-day surprise.
      const DUE_SOON_DAYS = MONTH_DAYS - 5;
      const now = Date.now();

      const results = Object.entries(lastPaidByClient)
        .filter(([clientId]) => nameById[clientId]) // only this coach's current clients
        .map(([clientId, paidAt]) => {
          const daysSincePaid = Math.floor((now - new Date(paidAt).getTime()) / 86_400_000);
          return {
            clientId,
            clientName: nameById[clientId],
            lastPaidAt: paidAt,
            daysSincePaid,
            daysOverdue: daysSincePaid - MONTH_DAYS // negative = not yet due
          };
        })
        .filter(r => r.daysSincePaid >= DUE_SOON_DAYS);

      return results.sort((a, b) => b.daysSincePaid - a.daysSincePaid);
    } catch (e) {
      console.error('Cloud DB getRenewalDueClients error:', e);
      return null;
    }
  },

  async saveChatMessage(clientId, sender, message) {
    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (restInsert) instead of supabase.from() — same
        // SDK-hang bypass as everywhere else in this file.
        const data = await restInsert('chat_messages', {
          client_id: clientId,
          sender: sender,
          message: message
        });
        if (data) {
          return [data];
        }
      } catch (directError) {
        // Same fallback shape as saveWorkoutSession's workout_logs path —
        // see api/save-user-data.js. Only falls through to the localStorage
        // mock below if this ALSO fails.
        console.warn('chat_messages client-side insert failed, falling back to server:', directError?.message || directError);
        try {
          const { headers } = await serverFallbackAuth();
          const resp = await fetch('/api/save-user-data?action=chat-message', {
            method: 'POST', headers, body: JSON.stringify({ clientId, sender, message })
          });
          const body = await resp.json().catch(() => null);
          if (resp.ok && body?.message) {
            return [body.message];
          }
        } catch (e2) { /* fall through to local mock below */ }
        console.error('Cloud DB Save Chat Error, falling back to local:', directError);
      }
    }
    
    // Offline local storage fallback
    const key = `local_chat_${clientId || 'guest'}`;
    const stored = localStorage.getItem(key);
    let messages = [];
    if (stored) {
      try { messages = JSON.parse(stored); } catch(e) {}
    }
    const newMsg = {
      id: Date.now(),
      sender: sender,
      text: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    messages.push(newMsg);
    localStorage.setItem(key, JSON.stringify(messages));
    return [newMsg];
  },

  async getChatMessages(clientId) {
    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (restSelect) instead of supabase.from() — same
        // SDK-hang bypass as everywhere else in this file.
        const data = await restSelect(
          `chat_messages?select=*&client_id=eq.${encodeURIComponent(clientId)}&order=created_at.asc`
        );
        if (data) {
          return data.map(msg => ({
            id: msg.id,
            sender: msg.sender,
            text: msg.message,
            time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));
        }
      } catch (e) {
        console.error('Cloud DB Get Chat Error, falling back to local:', e);
      }
    }
    
    // Offline local storage fallback
    const key = `local_chat_${clientId || 'guest'}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {}
    }
    return [];
  },

  // ─── DEFAULT WORKOUT TEMPLATES (Push/Pull/Leg) ───
  BUILTIN_TEMPLATES: [
    {
      id: 'tpl-push-day',
      name: 'Push Day',
      emoji: '💪',
      description: 'Chest, shoulders & triceps',
      is_default: true,
      exercises: [
        { name: 'Flat Bench Press',        sets: 3, reps: '8–12', order: 1 },
        { name: 'Overhead Triceps Extension', sets: 3, reps: '8–12', order: 2 },
        { name: 'Incline Dumbbell Press',  sets: 3, reps: '8–12', order: 3 },
        { name: 'Dumbbell Lateral Raises', sets: 3, reps: '10–15', order: 4 }
      ]
    },
    {
      id: 'tpl-pull-day',
      name: 'Pull Day',
      emoji: '🏋️',
      description: 'Back & biceps',
      is_default: true,
      exercises: [
        { name: 'Romanian Deadlift', sets: 3, reps: '8–12', order: 1 },
        { name: 'Lat Pull Down',     sets: 3, reps: '8–12', order: 2 },
        { name: 'One Arm Row',       sets: 3, reps: '8–12', order: 3 },
        { name: 'Biceps Curls',      sets: 3, reps: '10–15', order: 4 }
      ]
    },
    {
      id: 'tpl-leg-day',
      name: 'Leg Day',
      emoji: '🦵',
      description: 'Quads, hamstrings & calves',
      is_default: true,
      exercises: [
        { name: 'Barbell Squat',      sets: 3, reps: '8–12', order: 1 },
        { name: 'Leg Extensions',     sets: 3, reps: '10–15', order: 2 },
        { name: 'Romanian Deadlift',  sets: 3, reps: '8–12', order: 3 },
        { name: 'Hanging Leg Raises', sets: 3, reps: '12–15', order: 4 }
      ]
    }
  ],

  async getDefaultWorkoutTemplates() {
    if (isSupabaseConfigured) {
      try {
        // Excludes difficulty-leveled generic workouts (see getGenericWorkoutsByLevel)
        // so this keeps returning only the original undifferentiated Push/Pull/Leg
        // Day templates — the leveled library is a separate, additive surface.
        // Raw PostgREST read (bypasses the hanging SDK) — this feeds the
        // "Workout Library" screen's loading state, which otherwise spins
        // forever if the SDK's auth-token refresh stalls.
        const data = await restSelect(
          `workout_templates?select=*&is_default=eq.true&difficulty_level=is.null&order=created_at.asc`
        );

        if (data && data.length > 0) {
          return data.map(t => ({
            id: t.id,
            name: t.name,
            emoji: t.name.toLowerCase().includes('push') ? '💪' : t.name.toLowerCase().includes('pull') ? '🏋️' : '🦵',
            description: t.name.toLowerCase().includes('push') ? 'Chest, shoulders & triceps' :
                         t.name.toLowerCase().includes('pull') ? 'Back & biceps' : 'Quads, hamstrings & calves',
            is_default: t.is_default,
            exercises: Array.isArray(t.exercises) ? t.exercises : JSON.parse(t.exercises || '[]')
          }));
        }
      } catch (e) {
        console.error('Cloud DB: Failed to load workout templates:', e);
      }
    }
    // Fallback to built-in hardcoded templates
    return this.BUILTIN_TEMPLATES;
  },

  // ─── GENERIC WORKOUT LIBRARY BY DIFFICULTY LEVEL ───
  async getGenericWorkoutsByLevel(level) {
    if (!['beginner', 'intermediate', 'advanced'].includes(level)) return [];

    if (isSupabaseConfigured) {
      try {
        // Raw PostgREST read (bypasses the hanging SDK) — feeds the
        // "Loading {level} workouts..." state on the Workout Library screen.
        const data = await restSelect(
          `workout_templates?select=*&difficulty_level=eq.${encodeURIComponent(level)}&order=created_at.asc`
        );
        if (data) {
          return data.map(t => ({
            id: t.id,
            name: t.name,
            difficulty_level: t.difficulty_level,
            exercises: Array.isArray(t.exercises) ? t.exercises : JSON.parse(t.exercises || '[]')
          }));
        }
      } catch (e) {
        console.error('Cloud DB: Failed to load generic workouts by level:', e);
      }
    }
    return [];
  },

  // ─── WORKOUT ROUTINE TEMPLATES / PLANS ───
  normalizePlanExercises,

  async getWorkoutPlansForUser(userId) {
    if (isSupabaseConfigured) {
      try {
        // Resolve user UUID — try the passed value first, then session userId.
        // Raw PostgREST reads throughout (bypass the hanging SDK) — this feeds
        // "Loading coach plans..." / "Loading templates..." on the Log Sets
        // screen, which otherwise spins forever if the SDK's auth-token
        // refresh stalls.
        let resolvedUserId = userId;
        const UUID_RE_LOCAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isUuid = UUID_RE_LOCAL.test(userId);

        if (!isUuid) {
          // Try name lookup first
          const usersByName = await restSelect(
            `users?select=id&full_name=ilike.${encodeURIComponent(userId)}&limit=1`
          );
          if (Array.isArray(usersByName) && usersByName[0]) {
            resolvedUserId = usersByName[0].id;
          } else {
            // Fall back to the authenticated session's userId from localStorage
            const sessionId = localStorage.getItem('userId');
            if (sessionId && UUID_RE_LOCAL.test(sessionId)) {
              resolvedUserId = sessionId;
            }
          }
        }

        const isResolvedUuid = UUID_RE_LOCAL.test(resolvedUserId);
        if (isResolvedUuid) {
          let data = await restSelect(
            `workout_plans?select=*&user_id=eq.${encodeURIComponent(resolvedUserId)}&order=created_at.desc`
          );
          // Empty is ambiguous — genuinely no plans, or the RLS-vs-anon-key
          // gap this whole file works around elsewhere. Confirmed
          // 2026-08-11: a real client had 6 real coach-created plans and the
          // coach's "Assigned Workout Plans" panel still showed "No Plans
          // Assigned" — this table had never gotten the fallback the others
          // in this family of bugs already have.
          if (Array.isArray(data) && data.length === 0) {
            const serverPlans = await getWorkoutPlansViaServer(resolvedUserId);
            if (serverPlans && serverPlans.length > 0) data = serverPlans;
          }
          if (data) {
            return data.map(p => ({
              id: p.id,
              userId: p.user_id,
              planName: p.plan_name,
              exercises: normalizePlanExercises(p.exercises),
              createdBy: p.created_by,
              createdAt: p.created_at,
              // Legacy rows predate this column and read back as undefined —
              // treat those as assigned (matches the column's own DEFAULT
              // true, preserving every plan's existing visibility).
              isAssigned: p.is_assigned !== false
            }));
          }
        }
      } catch (e) {
        console.error('Cloud DB Fetch workout plans error:', e);
        const serverPlans = await getWorkoutPlansViaServer(userId);
        if (serverPlans) {
          return serverPlans.map(p => ({
            id: p.id,
            userId: p.user_id,
            planName: p.plan_name,
            exercises: normalizePlanExercises(p.exercises),
            createdBy: p.created_by,
            createdAt: p.created_at,
            isAssigned: p.is_assigned !== false
          }));
        }
      }
    }

    // Offline local storage fallback — also merge UUID-keyed entries
    const clientKey = await getCleanClientKey(userId);
    const key = `client_${clientKey}_workoutPlans`;
    const stored = localStorage.getItem(key);
    let plans = [];
    if (stored) {
      try { plans = JSON.parse(stored); } catch (e) { /* */ }
    }
    // Also check UUID-keyed localStorage if userId is a name
    const sessionId = localStorage.getItem('userId');
    if (sessionId && sessionId !== userId) {
      const uuidKey = `client_${sessionId}_workoutPlans`;
      const uuidStored = localStorage.getItem(uuidKey);
      if (uuidStored) {
        try {
          const uuidPlans = JSON.parse(uuidStored);
          // Merge, deduplicating by plan id
          const existingIds = new Set(plans.map(p => p.id));
          uuidPlans.forEach(p => { if (!existingIds.has(p.id)) plans.push(p); });
        } catch (e) { /* */ }
      }
    }
    return plans;
  },

  async saveWorkoutPlan(plan) {
    const targetUserId = plan.userId;

    if (plan.createdBy !== 'coach' && plan.createdBy !== 'client') {
      throw new Error('saveWorkoutPlan requires an explicit createdBy of "coach" or "client".');
    }

    // Never persist a plan with nothing in it. cleanEditorExercises() /
    // formattedExercises drop any exercise whose sets array is empty, so a
    // plan built entirely from setless exercises reduces to [] — and the
    // manual coach save path had no emptiness check (unlike the AI-draft
    // path right beside it, which skips `day.exercises.length === 0`). The
    // resulting row saved fine and then opened as a blank template, which
    // "Duplicate" would happily copy again. Normalizing here means the same
    // shape guarantee as the read side (see normalizePlanExercises).
    const cleanedExercises = normalizePlanExercises(plan.exercises);
    if (cleanedExercises.length === 0) {
      throw new Error('This plan has no exercises with sets — add at least one before saving.');
    }
    plan = { ...plan, exercises: cleanedExercises };

    // Set fallback local ID if not defined
    if (!plan.id) {
      plan.id = `plan-${Date.now()}`;
    }
    plan.createdAt = plan.createdAt || new Date().toISOString();

    if (isSupabaseConfigured && supabase) {
      try {
        let resolvedUserId = targetUserId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId);
        
        if (!isUuid) {
          // Raw PostgREST (restSelect) instead of supabase.from() — same
          // SDK-hang bypass as everywhere else in this file.
          const usersByName = await restSelect(`users?full_name=ilike.${encodeURIComponent(targetUserId)}&select=id`);
          if (usersByName[0]) {
            resolvedUserId = usersByName[0].id;
          }
        }

        const planRecord = {
          plan_name: plan.planName,
          exercises: plan.exercises,
          created_by: plan.createdBy,
          // Defaults to true (an actual assignment) unless the caller says
          // otherwise — Live Log passes isAssigned: false so the saved plan
          // shows up in the coach's own list without notifying/appearing on
          // the client's "Coach Assigned Plans" section.
          is_assigned: plan.isAssigned !== false
        };

        const isPlanUuid = plan.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plan.id);
        if (isPlanUuid) {
          planRecord.id = plan.id;
        }
        planRecord.user_id = resolvedUserId;

        // Raw PostgREST (restUpsert) instead of supabase.from() — same
        // SDK-hang bypass as everywhere else in this file. No onConflict
        // passed — PostgREST resolves on the table's primary key by default.
        const data = await restUpsert('workout_plans', planRecord);
        if (data) {
          plan.id = data.id;
          plan.userId = data.user_id;
        }
      } catch (e) {
        console.error('Cloud DB Workout Plan Sync Error:', e);
      }
    }

    // Mirror to local storage
    const clientKey = await getCleanClientKey(targetUserId);
    const key = `client_${clientKey}_workoutPlans`;
    const stored = localStorage.getItem(key);
    let plans = [];
    if (stored) {
      try { plans = JSON.parse(stored); } catch(e) {}
    }
    
    const existingIdx = plans.findIndex(p => p.id === plan.id || p.planName.toLowerCase() === plan.planName.toLowerCase());
    if (existingIdx >= 0) {
      plans[existingIdx] = plan;
    } else {
      plans.push(plan);
    }
    localStorage.setItem(key, JSON.stringify(plans));
    return plan;
  },

  async deleteWorkoutPlan(planId, userId) {
    if (isSupabaseConfigured && supabase) {
      try {
        const isPlanUuid = planId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId);
        if (isPlanUuid) {
          // Raw PostgREST (restDelete) instead of supabase.from() — same
          // SDK-hang bypass as everywhere else in this file.
          await restDelete(`workout_plans?id=eq.${encodeURIComponent(planId)}`);
        }
      } catch (e) {
        console.error('Cloud DB Workout Plan Delete Error:', e);
      }
    }

    // Mirror to local storage
    const clientKey = await getCleanClientKey(userId);
    const key = `client_${clientKey}_workoutPlans`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        let plans = JSON.parse(stored);
        plans = plans.filter(p => p.id !== planId);
        localStorage.setItem(key, JSON.stringify(plans));
      } catch(e) {
        console.error("Error deleting local workout plan:", e);
      }
    }
  },

  // ─── WORKOUT DRAFTS (resume an in-progress logging session) ───
  // One row per client (upsert on user_id) holding whichever session is
  // currently open for them — written by the client's own Log Sets screen
  // (source:'self') or by their coach's Live Log (source:'coach', coachId
  // set). Deleted the moment that session is finished or discarded. This is
  // a live "what's open right now" table, never history.
  async saveWorkoutDraft(draft) {
    if (!isSupabaseConfigured || !supabase || !draft?.userId) return;
    const record = {
      user_id: draft.userId,
      coach_id: draft.coachId || null,
      source: draft.source === 'coach' ? 'coach' : 'self',
      plan_name: draft.planName || null,
      log_date: draft.logDate || null,
      exercises: draft.exercises || [],
      timer_status: draft.timerStatus || 'idle',
      timer_started_at: draft.timerStartedAt ?? null,
      pause_intervals: draft.pauseIntervals || [],
      updated_at: new Date().toISOString()
    };
    try {
      // Raw PostgREST (restUpsert) instead of supabase.from() — same
      // SDK-hang bypass as everywhere else in this file.
      await restUpsert('workout_drafts', record, 'user_id');
    } catch (e) {
      console.error('Cloud DB Save Workout Draft Error:', e);
      // workout_drafts' live INSERT policy turned out to be auth.uid()-based
      // rather than the permissive one sql/lock_down_reads.sql describes —
      // same drift documented for workout_logs (see save-workout-session.js)
      // — so the client-side upsert above 42501s every time. Fall back to
      // the service-role-backed endpoint rather than silently dropping the
      // draft; without this, the Home tab's "resume workout" banner never
      // had anything to read back. Confirmed 2026-08-24.
      await saveWorkoutDraftViaServer(record);
    }
  },

  async getWorkoutDraft(userId) {
    if (!isSupabaseConfigured || !userId) return null;
    const normalize = (row) => !row ? null : {
      userId: row.user_id,
      coachId: row.coach_id,
      source: row.source,
      planName: row.plan_name,
      logDate: row.log_date,
      exercises: row.exercises || [],
      timerStatus: row.timer_status || 'idle',
      timerStartedAt: row.timer_started_at ?? null,
      pauseIntervals: row.pause_intervals || [],
      updatedAt: row.updated_at
    };
    try {
      const rows = await restSelect(
        `workout_drafts?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row) return normalize(row);
    } catch (e) {
      console.error('Cloud DB Get Workout Draft Error:', e);
    }
    // A null/errored result here doesn't prove "no draft" — RLS silently
    // returns zero rows on a stale/expired bearer instead of throwing, the
    // same asymmetry saveWorkoutDraft's write-side fallback above exists
    // for. Confirm via the service-role-backed read before believing it;
    // without this, a draft that only ever reached the DB through that
    // fallback (RLS blocking the direct upsert) could still read back empty
    // here, leaving the Home tab's "resume workout" banner missing even
    // though the draft genuinely exists. Confirmed 2026-08-24.
    return normalize(await getWorkoutDraftViaServer(userId));
  },

  // For the coach's own home/client-list screen: every session currently
  // open that THEY are logging live for a client, across all their clients.
  async getCoachActiveDrafts(coachId) {
    if (!isSupabaseConfigured || !coachId) return [];
    try {
      const rows = await restSelect(
        `workout_drafts?select=*&coach_id=eq.${encodeURIComponent(coachId)}`
      );
      return (rows || []).map(row => ({
        userId: row.user_id,
        coachId: row.coach_id,
        source: row.source,
        planName: row.plan_name,
        logDate: row.log_date,
        exercises: row.exercises || [],
        timerStatus: row.timer_status || 'idle',
        timerStartedAt: row.timer_started_at ?? null,
        pauseIntervals: row.pause_intervals || [],
        updatedAt: row.updated_at
      }));
    } catch (e) {
      console.error('Cloud DB Get Coach Active Drafts Error:', e);
      return [];
    }
  },

  async deleteWorkoutDraft(userId) {
    if (!isSupabaseConfigured || !supabase || !userId) return;
    try {
      // Raw PostgREST (restDelete) instead of supabase.from() — same
      // SDK-hang bypass as everywhere else in this file.
      await restDelete(`workout_drafts?user_id=eq.${encodeURIComponent(userId)}`);
    } catch (e) {
      console.error('Cloud DB Delete Workout Draft Error:', e);
    }
  },

  // ─── BODY MEASUREMENTS (15-day progress, shared with coach) ───
  // History table: one row per save. The client saves their own; the coach
  // reads the same rows for a client read-only. The 15-day cadence is
  // enforced in the UI (see ClientProfile), not here.
  async saveBodyMeasurement(userId, measurements) {
    if (!isSupabaseConfigured || !userId) {
      return { success: false, error: 'Not configured' };
    }
    let data;
    try {
      data = await restInsert('body_measurements', { user_id: userId, measurements: measurements || {} });
    } catch (directError) {
      // Same fallback shape as saveWorkoutSession's workout_logs path — see
      // api/save-user-data.js.
      console.warn('body_measurements client-side insert failed, falling back to server:', directError?.message || directError);
      try {
        const { headers } = await serverFallbackAuth();
        const resp = await fetch('/api/save-user-data?action=body-measurement', {
          method: 'POST', headers, body: JSON.stringify({ userId, measurements })
        });
        const body = await resp.json().catch(() => null);
        if (!resp.ok || !body?.success) throw directError;
        return body;
      } catch (e2) {
        console.error('Cloud DB Save Body Measurement Error:', directError);
        return { success: false, error: directError.message || 'Save failed' };
      }
    }

    try {
      // Keep clients.weight_kg in sync with the client's latest logged
      // weight. body_measurements is history-only (insert-only, never
      // touches clients) — but clients.weight_kg is what the coach's
      // Manage Client "Weight (kg)" stat tile reads (via userWeight, see
      // getAllUsers()) and what Live Log calorie math falls back to for
      // this client. Without this, logging weight here (the normal,
      // recurring way clients update it) silently never reaches either,
      // even though the top-level profile edit's weight field does.
      const weightVal = parseFloat(measurements?.weight);
      if (Number.isFinite(weightVal) && supabase) {
        // Raw PostgREST (restUpdate) instead of supabase.from() — same
        // SDK-hang bypass as everywhere else in this file.
        try {
          await restUpdate(`clients?user_id=eq.${encodeURIComponent(userId)}`, { weight_kg: weightVal });
        } catch (weightSyncError) {
          console.warn('Could not sync weight_kg onto clients row:', weightSyncError);
        }
      }

      return {
        success: true,
        entry: { id: data.id, userId: data.user_id, measurements: data.measurements || {}, measuredAt: data.measured_at }
      };
    } catch (e) {
      console.error('Cloud DB Save Body Measurement Error:', e);
      return { success: false, error: e.message || 'Save failed' };
    }
  },

  // Full measurement history for a user, newest first — used by both the
  // client's own Measurements screen and the coach's client detail view.
  async getBodyMeasurements(userId) {
    if (!isSupabaseConfigured || !userId) return [];
    try {
      const rows = await restSelect(
        `body_measurements?select=*&user_id=eq.${encodeURIComponent(userId)}&order=measured_at.desc`
      );
      return (rows || []).map(r => ({
        id: r.id,
        userId: r.user_id,
        measurements: r.measurements || {},
        measuredAt: r.measured_at
      }));
    } catch (e) {
      console.error('Cloud DB Get Body Measurements Error:', e);
      return [];
    }
  },

  // Coach-only override: removes one history row by id (e.g. a blank/bad
  // entry saved during the SDK-hang bug, which otherwise locks the client
  // out of re-entering real numbers for 15 days with nothing to show for
  // it). Not exposed on the client side — only from the coach's own view of
  // a connected client's measurements.
  async deleteBodyMeasurement(entryId) {
    if (!isSupabaseConfigured || !entryId) return { success: false, error: 'Not configured' };
    try {
      await restDelete(`body_measurements?id=eq.${encodeURIComponent(entryId)}`);
      return { success: true };
    } catch (e) {
      console.error('Cloud DB Delete Body Measurement Error:', e);
      return { success: false, error: e.message || 'Delete failed' };
    }
  },

  // ─── COACH NOTES ───
  // A one-off note from a coach to a client (not a chat thread). Stored so the
  // client can still see it if they missed/dismissed the push. Raw REST insert
  // (same SDK-hang bypass as body measurements). clientId is the client's
  // users.id; coachId is the coach's users.id.
  async saveCoachNote(clientId, coachId, message) {
    if (!isSupabaseConfigured || !clientId || !message?.trim()) {
      return { success: false, error: 'Not configured' };
    }
    try {
      const data = await restInsert('coach_notes', {
        client_id: clientId,
        coach_id: coachId || null,
        message: message.trim()
      });
      return {
        success: true,
        note: { id: data.id, clientId: data.client_id, coachId: data.coach_id, message: data.message, createdAt: data.created_at, readAt: data.read_at }
      };
    } catch (e) {
      console.error('Cloud DB Save Coach Note Error:', e);
      return { success: false, error: e.message || 'Save failed' };
    }
  },

  // The client's own unread coach notes, newest first — powers the "Note from
  // your coach" card on the client home screen (the missed-push fallback).
  async getUnreadCoachNotes(clientId) {
    if (!isSupabaseConfigured || !clientId) return [];
    try {
      const rows = await restSelect(
        `coach_notes?select=*&client_id=eq.${encodeURIComponent(clientId)}&read_at=is.null&order=created_at.desc`
      );
      return (rows || []).map(r => ({
        id: r.id,
        clientId: r.client_id,
        coachId: r.coach_id,
        message: r.message,
        createdAt: r.created_at,
        readAt: r.read_at,
        clientReply: r.client_reply,
        clientReplyAt: r.client_reply_at
      }));
    } catch (e) {
      console.error('Cloud DB Get Coach Notes Error:', e);
      return [];
    }
  },

  // Timestamp of the most recently sent note for a client, read or not — lets
  // the coach's "Send [client] a note" composer tell whether the LATEST
  // session has already been responded to, so it doesn't keep resurfacing for
  // a session the coach already sent a note about (previously this was only
  // tracked in React state, which reset every time the coach navigated away
  // and back, and had no cutoff at all for stale sessions).
  async getLatestCoachNoteSentAt(clientId) {
    if (!isSupabaseConfigured || !clientId) return null;
    try {
      const rows = await restSelect(
        `coach_notes?select=created_at&client_id=eq.${encodeURIComponent(clientId)}&order=created_at.desc&limit=1`
      );
      return (rows && rows[0] && rows[0].created_at) || null;
    } catch (e) {
      console.error('Cloud DB Get Latest Coach Note Error:', e);
      return null;
    }
  },

  // ─── CLIENT PAYMENTS ───
  // A coach's own manual ledger of payments received from clients (cash/UPI/
  // bank transfer/etc. collected outside the app) — see sql migration
  // create_client_payments_table. Purely a record: logging one here does not
  // touch users.payment_status or any other part of the app (2026-08-28
  // feature request). clientId/coachId are both users.id, same convention as
  // coach_notes above.
  async addClientPayment(clientId, coachId, { amount, method, paidAt, note } = {}) {
    if (!isSupabaseConfigured || !clientId || !coachId || !amount || !method) {
      return { success: false, error: 'Missing required fields' };
    }
    try {
      const data = await restInsert('client_payments', {
        client_id: clientId,
        coach_id: coachId,
        amount,
        method,
        paid_at: paidAt || new Date().toISOString(),
        note: note?.trim() || null
      });
      return {
        success: true,
        payment: {
          id: data.id,
          clientId: data.client_id,
          coachId: data.coach_id,
          amount: Number(data.amount),
          method: data.method,
          paidAt: data.paid_at,
          note: data.note,
          createdAt: data.created_at
        }
      };
    } catch (e) {
      console.error('Cloud DB Add Client Payment Error:', e);
      return { success: false, error: e.message || 'Save failed' };
    }
  },

  // Every payment this coach has logged across all their clients, newest
  // first — powers the sidebar Payments tab. client_payments.client_id is a
  // direct FK to users(id) (same convention as coach_notes, NOT the clients
  // table's own PK — see getClientsForCoach's id-vs-user_id mapping), so the
  // client's name is embedded straight off users.full_name in one round
  // trip rather than a second query per row.
  async getClientPaymentsForCoach(coachId) {
    if (!isSupabaseConfigured || !coachId) return [];
    try {
      const rows = await restSelect(
        `client_payments?select=*,users!client_payments_client_id_fkey(full_name)&coach_id=eq.${encodeURIComponent(coachId)}&order=paid_at.desc`
      );
      return (rows || []).map(r => ({
        id: r.id,
        clientId: r.client_id,
        clientName: r.users?.full_name || 'Unknown client',
        coachId: r.coach_id,
        amount: Number(r.amount),
        method: r.method,
        paidAt: r.paid_at,
        note: r.note,
        createdAt: r.created_at
      }));
    } catch (e) {
      console.error('Cloud DB Get Client Payments Error:', e);
      return [];
    }
  },

  // Correcting a logged payment (wrong amount/method/date typed in the
  // one-step form) — only the fields actually editable in the UI, not
  // client/coach (moving a payment to a different client is a delete +
  // re-log, not an edit).
  async updateClientPayment(paymentId, { amount, method, paidAt } = {}) {
    if (!isSupabaseConfigured || !paymentId) return { success: false, error: 'Missing payment id' };
    try {
      const body = {};
      if (amount != null) body.amount = amount;
      if (method) body.method = method;
      if (paidAt) body.paid_at = paidAt;
      const data = await restUpdate(`client_payments?id=eq.${encodeURIComponent(paymentId)}`, body);
      return {
        success: true,
        payment: {
          id: data.id,
          clientId: data.client_id,
          coachId: data.coach_id,
          amount: Number(data.amount),
          method: data.method,
          paidAt: data.paid_at,
          note: data.note,
          createdAt: data.created_at
        }
      };
    } catch (e) {
      console.error('Cloud DB Update Client Payment Error:', e);
      return { success: false, error: e.message || 'Update failed' };
    }
  },

  async deleteClientPayment(paymentId) {
    if (!isSupabaseConfigured || !paymentId) return { success: false, error: 'Missing payment id' };
    try {
      await restDelete(`client_payments?id=eq.${encodeURIComponent(paymentId)}`);
      return { success: true };
    } catch (e) {
      console.error('Cloud DB Delete Client Payment Error:', e);
      return { success: false, error: e.message || 'Delete failed' };
    }
  },

  // Whether the client still has the one-time "Welcome to Fitengineers"
  // banner (WelcomeBanner.jsx) to see. See sql/supabase_welcome_message.sql.
  async getWelcomeSeen(userId) {
    if (!isSupabaseConfigured || !userId) return true;
    try {
      const rows = await restSelect(`clients?user_id=eq.${encodeURIComponent(userId)}&select=welcome_seen`);
      // Zero rows is ambiguous, same RLS-vs-anon-key gap documented all over
      // this file (e.g. getUserProfileByEmail): it means either "no such
      // client" or "read went out before the auth token was ready" (exactly
      // the fresh-session window right after login) — NOT "row exists with
      // welcome_seen unset". Treating that ambiguity as "show the banner"
      // would risk resurfacing it for an already-onboarded existing client on
      // that race. Fail closed (never show) whenever we can't positively
      // confirm welcome_seen === false from a real row.
      if (!Array.isArray(rows) || rows.length === 0) return true;
      return rows[0]?.welcome_seen !== false;
    } catch (e) {
      console.error('Cloud DB Get Welcome Seen Error:', e);
      return true; // fail closed — never show a stray banner on a read error
    }
  },

  // Dismissing the welcome banner marks it seen server-side so it stops
  // resurfacing across devices/logins, same reasoning as markCoachNoteRead.
  async markWelcomeSeen(userId) {
    if (!isSupabaseConfigured || !userId) return { success: false };
    try {
      await restUpdate(`clients?user_id=eq.${encodeURIComponent(userId)}`, { welcome_seen: true });
      return { success: true };
    } catch (e) {
      console.error('Cloud DB Mark Welcome Seen Error:', e);
      return { success: false, error: e.message || 'Update failed' };
    }
  },

  // Mark a note read once the client has seen it, so it stops resurfacing.
  async markCoachNoteRead(noteId) {
    if (!isSupabaseConfigured || !noteId) return { success: false };
    try {
      await restUpdate(`coach_notes?id=eq.${encodeURIComponent(noteId)}`, { read_at: new Date().toISOString() });
      return { success: true };
    } catch (e) {
      console.error('Cloud DB Mark Coach Note Read Error:', e);
      return { success: false, error: e.message || 'Update failed' };
    }
  },

  // Client's one-shot reply to a specific coach note, written straight onto
  // that same coach_notes row. Guarded by client_reply_at=is.null so the
  // reply box for a given note can only ever be used once — matches the
  // banner only rendering the reply box while note.clientReplyAt is unset.
  async saveClientReplyToNote(noteId, message) {
    if (!isSupabaseConfigured || !noteId || !message?.trim()) {
      return { success: false, error: 'Not configured' };
    }
    try {
      const data = await restUpdate(`coach_notes?id=eq.${encodeURIComponent(noteId)}&client_reply_at=is.null`, {
        client_reply: message.trim(),
        client_reply_at: new Date().toISOString()
      });
      if (!data) return { success: false, error: 'Already replied to this note.' };
      return { success: true };
    } catch (e) {
      console.error('Cloud DB Save Client Reply Error:', e);
      return { success: false, error: e.message || 'Save failed' };
    }
  },

  // This coach's unseen client replies across all their clients — powers the
  // pending-replies card on the coach's client-directory (home) screen.
  async getPendingClientReplies(coachId) {
    if (!isSupabaseConfigured || !coachId) return [];
    try {
      const rows = await restSelect(
        `coach_notes?select=id,client_id,client_reply,client_reply_at&coach_id=eq.${encodeURIComponent(coachId)}&client_reply_at=not.is.null&coach_seen_reply_at=is.null&order=client_reply_at.desc`
      );
      return (rows || []).map(r => ({
        id: r.id,
        clientId: r.client_id,
        message: r.client_reply,
        repliedAt: r.client_reply_at
      }));
    } catch (e) {
      console.error('Cloud DB Get Pending Client Replies Error:', e);
      return [];
    }
  },

  // Coach has seen this reply on the directory card — stops it resurfacing.
  async markClientReplySeen(noteId) {
    if (!isSupabaseConfigured || !noteId) return { success: false };
    try {
      await restUpdate(`coach_notes?id=eq.${encodeURIComponent(noteId)}`, { coach_seen_reply_at: new Date().toISOString() });
      return { success: true };
    } catch (e) {
      console.error('Cloud DB Mark Client Reply Seen Error:', e);
      return { success: false, error: e.message || 'Update failed' };
    }
  },

  // ─── MULTI-COACH & SUPER ADMIN METHODS ───
  // Resolves a coach's display name for client-facing UI (e.g. "Coach: [Name]"
  // after a successful invite-code connection). Prefers the coach's own account
  // name over their business/brand name, since "actual name" was the ask;
  // returns null (caller falls back to the raw coach_id) if neither exists.
  async getCoachNameById(coachId) {
    if (!coachId || !isSupabaseConfigured) return null;
    try {
      // Raw PostgREST reads (bypasses the hanging SDK — same workaround as
      // restSelect's other callers). This previously used supabase.from(),
      // which can hang indefinitely and never resolve or reject — silently
      // leaving the coach's name unresolved forever (localStorage.userCoachName
      // never gets set, so the header keeps showing the literal "Coach"
      // placeholder even after a refresh, since getOwnCoachConnection's
      // connection status itself already resolved fine via restSelect and
      // never retries the name lookup once it thinks a fetch is in flight).
      const userRows = await restSelect(`users?select=full_name&id=eq.${encodeURIComponent(coachId)}&limit=1`);
      const fullName = Array.isArray(userRows) ? userRows[0]?.full_name : null;
      if (fullName) return fullName;
      const coachRows = await restSelect(`coaches?select=brand_name&user_id=eq.${encodeURIComponent(coachId)}&limit=1`);
      const brandName = Array.isArray(coachRows) ? coachRows[0]?.brand_name : null;
      if (brandName) return brandName;
      // Both reads came back empty — same RLS blanking as everywhere else in
      // this file (empty result, no error, so the catch never fires). Falling
      // through to null makes the caller render the raw coach UUID in the
      // header. The service-role lookup already resolves this name, so use it.
      return await getCoachNameViaServer();
    } catch (e) {
      console.error('[getCoachNameById] error:', e);
      return await getCoachNameViaServer();
    }
  },

  // Full business-profile fields for the client's own connected coach (shown
  // read-only when a client taps the "Coach: [Name]" pill).
  //
  // Goes straight to the service-role-backed server lookup (see
  // getCoachDetailsViaServer / api/data-read.js's handleLookupProfile),
  // deliberately skipping a direct client-side restSelect. Two reasons:
  //   1. It first went through restSelect (users/coaches, authenticated as
  //      the client), same as getCoachNameById — but that hung the modal on
  //      "Loading coach details…" forever for a real connected client with
  //      real coach data, confirmed 2026-08-31. This file has a long history
  //      of restSelect/resolveBearerToken getting stuck on the Supabase JS
  //      SDK's token-refresh path (see resolveBearerToken's and
  //      refreshAccessTokenRaw's comments above) — a straightforward
  //      candidate given nothing else about that path looked wrong.
  //   2. The server lookup is already the fallback other callers reach for
  //      in this exact situation, needs no coachId (resolves the caller's
  //      own connection from their verified email), and was confirmed
  //      working end-to-end via curl for this same account — so making it
  //      the ONLY path removes the hang risk entirely instead of leaving a
  //      slow/hanging first attempt in front of a working fallback.
  // coachId is accepted for API-compat with existing callers but unused.
  async getCoachDetailsById(_coachId) {
    if (!isSupabaseConfigured) return null;
    return await getCoachDetailsViaServer();
  },

  // Coach-login lookup: the full coaches row for a just-authenticated
  // user_id (is_blocked check, coach.id for userCoachId, etc.) and, when
  // ensureAdminRow is true, auto-creates an approved row for the super-admin
  // account if one doesn't exist yet. Raw PostgREST (restSelect/restInsert),
  // not supabase.from() — this used to be a raw SDK call sitting directly on
  // Onboarding.jsx's coach sign-in success path, unguarded by any dev-only
  // flag, immediately after a fresh sign-in (exactly when a token refresh is
  // plausible) — the same SDK-hang risk documented throughout this file,
  // just reached on every single coach login instead of an edge case. A hang
  // here left the login button spinning forever with no error. Confirmed and
  // fixed 2026-08-25.
  async getCoachRecordByUserId(userId, { ensureAdminRow = false } = {}) {
    if (!userId || !isSupabaseConfigured) return null;
    const rows = await restSelect(`coaches?user_id=eq.${encodeURIComponent(userId)}&select=*`);
    let record = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!record && ensureAdminRow) {
      record = await restUpsert('coaches', {
        user_id: userId,
        status: 'approved',
        brand_name: 'Admin Fitness'
      }, 'user_id');
    }
    return record;
  },

  async getAllCoaches() {
    if (isSupabaseConfigured && supabase) {
      try {
        // Source of truth for "is a coach" is the coaches table, not users.role —
        // the super-admin account has an approved coaches row but role='super-admin',
        // so filtering users by role='coach' was excluding them from this list entirely.
        // Same last_login-column-might-not-exist-yet fallback as getAllUsers.
        // Raw PostgREST (restSelect) instead of supabase.from() — same
        // SDK-hang bypass as everywhere else in this file.
        let data;
        try {
          data = await restSelect(
            `coaches?select=user_id,brand_name,status,experience_years,is_blocked,created_at,users(id,email,full_name,payment_status,created_at,last_login)&status=eq.approved&order=created_at.asc`
          );
        } catch (e) {
          // last_login might not be migrated in yet — retry without it rather
          // than losing the whole coaches list (same fallback as getAllUsers).
          if (String(e.message).includes('400')) {
            data = await restSelect(
              `coaches?select=user_id,brand_name,status,experience_years,is_blocked,created_at,users(id,email,full_name,payment_status,created_at)&status=eq.approved&order=created_at.asc`
            );
          } else {
            throw e;
          }
        }

        if (data) {
          // Live count of clients currently linked to each coach — COUNT(*) FROM clients
          // WHERE coach_id = <coach id>. This is the same `clients` table Part 4's
          // "Connect to coach" flow updates on a successful connection, so a freshly
          // connected client is reflected here on the next load with no extra steps.
          const clientCounts = await restSelect(`clients?select=coach_id`);

          return data.map(coach => {
            const coachUserId = coach.user_id;
            const clients = clientCounts ? clientCounts.filter(c => c.coach_id === coachUserId) : [];
            return {
              id: coachUserId,
              name: coach.users?.full_name || 'Coach',
              email: coach.users?.email || '',
              brand: coach.brand_name || 'Fit Engineers',
              payment_status: coach.users?.payment_status || 'active',
              experienceYears: coach.experience_years ?? null,
              isBlocked: coach.is_blocked === true,
              signup_date: coach.created_at || coach.users?.created_at || new Date().toISOString(),
              clientsCount: clients.length,
              last_login: coach.users?.last_login || null
            };
          });
        }
      } catch (e) {
        console.error('Cloud DB Fetch all coaches error:', e);
      }
    }

    // Local storage fallback for coaches
    const cachedCoaches = localStorage.getItem('coaches_list');
    let coaches = cachedCoaches ? JSON.parse(cachedCoaches) : [
      { id: 'coach-ravi', name: 'Coach Ravi', email: 'ravi@fitengineers.com', brand: 'Ravi Fitness', payment_status: 'active', signup_date: new Date().toISOString(), clientsCount: 0 },
      { id: 'coach-subodh', name: 'Coach Subodh', email: 'coach@fitengineers.com', brand: 'Fit Engineers', payment_status: 'active', signup_date: new Date().toISOString(), clientsCount: 0 }
    ];

    // Compute client counts from the same mock `clients` table the offline
    // "Connect to coach" fallback writes coach_id onto.
    const mockClients = this.getMockTable('clients');
    coaches.forEach(coach => {
      coach.clientsCount = mockClients.filter(c => c.coach_id === coach.id).length;
    });

    return coaches;
  },

  // ─── ADMIN: LIVE COACH CLIENT COUNTS ───
  // Queries approved coaches from public.coaches joined with public.users for display names,
  // then counts clients per coach from public.clients WHERE coach_id = <coach's users.id>.
  // This accurately reflects Part 4's connect flow (clients.coach_id = coach's users.id UUID).
  async getCoachesWithClientCounts() {
    if (isSupabaseConfigured && supabase) {
      try {
        // 1. Get all approved coaches with their user info (name, email).
        // Raw PostgREST (restSelect) instead of supabase.from() — same
        // SDK-hang bypass as everywhere else in this file.
        const coachRows = await restSelect(
          `coaches?select=id,user_id,brand_name,status,created_at,users(id,email,full_name)&status=eq.approved&order=created_at.asc`
        );

        if (!coachRows || coachRows.length === 0) {
          // Fallback: try fetching from users table with role=coach
          const userCoaches = await restSelect(`users?select=id,email,full_name,created_at&role=eq.coach`);

          // Count clients per coach using users.id (= clients.coach_id)
          const allClients = await restSelect(`clients?select=coach_id`);

          return (userCoaches || []).map(coach => {
            const count = (allClients || []).filter(c => c.coach_id === coach.id).length;
            return {
              id: coach.id,
              userId: coach.id,
              name: coach.full_name || coach.email?.split('@')[0] || 'Coach',
              email: coach.email || '',
              clientCount: count,
              joined: coach.created_at
            };
          });
        }

        // 2. Fetch all clients and their coach_id in one query (avoids N+1)
        const allClients = await restSelect(`clients?select=coach_id`);

        // 3. Map each coach: count clients WHERE clients.coach_id = coach's users.id
        return coachRows.map(coach => {
          const coachUserId = coach.user_id || coach.users?.id;
          const count = (allClients || []).filter(c => c.coach_id === coachUserId).length;
          return {
            id: coach.id,
            userId: coachUserId,
            name: coach.users?.full_name || coach.brand_name || coach.users?.email?.split('@')[0] || 'Coach',
            email: coach.users?.email || '',
            brand: coach.brand_name || '',
            clientCount: count,
            joined: coach.created_at
          };
        });
      } catch (e) {
        console.error('[getCoachesWithClientCounts] Error:', e);
      }
    }

    // Mock / offline fallback
    const mockCoaches = this.getMockTable('coaches');
    const mockClients = this.getMockTable('clients');
    const mockUsers = this.getMockTable('users');

    return mockCoaches.map(coach => {
      const coachUser = mockUsers.find(u => u.id === coach.user_id);
      const count = mockClients.filter(c => c.coach_id === coach.user_id).length;
      return {
        id: coach.id,
        userId: coach.user_id,
        name: coachUser?.full_name || coach.brand_name || 'Coach',
        email: coachUser?.email || '',
        brand: coach.brand_name || '',
        clientCount: count,
        joined: coach.created_at || new Date().toISOString()
      };
    });
  },

  async saveCoachProfile(coach) {
    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (restUpdate) instead of supabase.from() — same
        // SDK-hang bypass as everywhere else in this file.
        try {
          await restUpdate(`users?id=eq.${encodeURIComponent(coach.id)}`, {
            brand: coach.brand,
            payment_status: coach.payment_status,
            isSubscriptionActive: coach.payment_status === 'active'
          });
        } catch (error) {
          if (error.code === '42703') {
            await restUpdate(`users?id=eq.${encodeURIComponent(coach.id)}`, {
              brand: coach.brand,
              payment_status: coach.payment_status
            });
          } else {
            throw error;
          }
        }
      } catch (e) {
        console.error('Error saving coach profile on cloud DB:', e);
      }
    }

    // Mirror to local storage fallback
    const cachedCoaches = localStorage.getItem('coaches_list');
    if (cachedCoaches) {
      try {
        let coaches = JSON.parse(cachedCoaches);
        const idx = coaches.findIndex(c => c.id === coach.id);
        if (idx >= 0) {
          coaches[idx] = { ...coaches[idx], ...coach };
            localStorage.setItem('coaches_list', JSON.stringify(coaches));
            try { window.dispatchEvent(new CustomEvent('coaches_updated', { detail: coaches })); } catch(e) {}
        }
      } catch (e) {}
    } else {
      const defaults = [
        { id: 'coach-ravi', name: 'Coach Ravi', email: 'ravi@fitengineers.com', brand: 'Ravi Fitness', payment_status: 'active', signup_date: new Date().toISOString(), clientsCount: 0 },
        { id: 'coach-subodh', name: 'Coach Subodh', email: 'coach@fitengineers.com', brand: 'Fit Engineers', payment_status: 'active', signup_date: new Date().toISOString(), clientsCount: 0 }
      ];
      const idx = defaults.findIndex(c => c.id === coach.id);
      if (idx >= 0) {
        defaults[idx] = { ...defaults[idx], ...coach };
      }
      localStorage.setItem('coaches_list', JSON.stringify(defaults));
      try { window.dispatchEvent(new CustomEvent('coaches_updated', { detail: defaults })); } catch(e) {}
    }
  },

  // Self-service coach profile edit (CoachProfile.jsx) — distinct from
  // saveCoachProfile above, which is the SUPER-ADMIN coach-management path
  // (brand/payment_status only, keyed by users.id from the admin's coach
  // list). This one is the coach editing their own name/phone/business info.
  //
  // Uses restUpdate (PATCH), never restUpsert/on_conflict — both the coaches
  // and users rows already exist by the time a coach can open this screen
  // (created at signup), so there's nothing to insert. This sidesteps the
  // documented on_conflict-hits-the-SELECT-policy 42501 trap entirely: a
  // plain PATCH only needs the UPDATE (and, for the returned representation,
  // SELECT) policy to pass for the coach's OWN row, which it does — these
  // calls run under the coach's real session token (resolveBearerToken),
  // not the anon key.
  async saveCoachSelfProfile({ userId, name, phone, brand, specialization, certifications, experienceYears, locationCity, socialHandle }) {
    if (!userId) throw new Error('Missing user id — could not save profile.');
    if (isSupabaseConfigured && supabase) {
      const expYears = parseInt(experienceYears, 10);
      await restUpdate(`users?id=eq.${encodeURIComponent(userId)}`, {
        full_name: name,
        phone: phone || null,
      });
      await restUpdate(`coaches?user_id=eq.${encodeURIComponent(userId)}`, {
        brand_name: brand || null,
        specialization: specialization || null,
        certifications: certifications || null,
        experience_years: Number.isFinite(expYears) ? expYears : null,
        location_city: locationCity || null,
        social_media_handle: socialHandle || null,
      });
    }

    // Mirror to localStorage regardless — same cache-then-reconcile pattern
    // used by every other profile screen in this app.
    if (name) localStorage.setItem('userName', name);
    if (phone) localStorage.setItem('userPhone', phone); else localStorage.removeItem('userPhone');
    if (brand) localStorage.setItem('userBrand', brand);
    localStorage.setItem('userSpecialization', specialization || '');
    localStorage.setItem('userCertifications', certifications || '');
    localStorage.setItem('userExperienceYears', experienceYears || '');
    localStorage.setItem('userLocationCity', locationCity || '');
    localStorage.setItem('userSocialHandle', socialHandle || '');
  },

  async getPlatformStats() {
    let totalWorkoutsLoggedThisWeek = 0;
    let totalActiveClients = 0;

    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (restSelect) instead of supabase.from() — same
        // SDK-hang bypass as everywhere else in this file.
        //
        // Counts from the `clients` table (same source + same stale-row
        // filter as getAllUsers, which is what actually powers "My Clients"/
        // "All Clients") rather than independently counting users.role=
        // 'client' — two different queries claiming to answer the same
        // question drifted apart the moment a clients row outlived its
        // owner's role (e.g. promoted to coach, old row never cleaned up):
        // "My Clients (37)" vs "Total Clients: 36" for the exact same
        // platform. Deriving both from one filtered query means they can't
        // disagree again. See getAllUsers' matching comment for the full
        // story (confirmed 2026-08-12).
        const clients = await restSelect(`clients?select=id,users!clients_user_id_fkey(role)`);
        if (clients) {
          totalActiveClients = clients.filter((c) => !c.users?.role || c.users.role === 'client').length;
        }

        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const startStr = startOfWeek.toISOString().split('T')[0];

        const workoutLogs = await restSelect(`workout_logs?select=log_date,user_id&log_date=gte.${startStr}`);

        if (workoutLogs) {
          const uniqueSessions = new Set(workoutLogs.map(l => `${l.user_id}_${l.log_date}`));
          totalWorkoutsLoggedThisWeek = uniqueSessions.size;
        }
        
        return { totalWorkoutsLoggedThisWeek, totalActiveClients };
      } catch (e) {
        console.error('Error calculating platform stats:', e);
      }
    }

    // Local storage fallback for platform stats
    let clientCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('client_') && key.endsWith('_userEmail')) {
        clientCount++;
      }
    }
    totalActiveClients = clientCount || 3;

    const globalSessionsRaw = localStorage.getItem('workoutSessions');
    if (globalSessionsRaw) {
      try {
        const sessions = JSON.parse(globalSessionsRaw);
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const startStr = startOfWeek.toISOString().split('T')[0];
        
        totalWorkoutsLoggedThisWeek = sessions.filter(s => s.date >= startStr).length;
      } catch(e) {}
    } else {
      totalWorkoutsLoggedThisWeek = 14;
    }

    return { totalWorkoutsLoggedThisWeek, totalActiveClients };
  },

  // ─── COACH REGISTRATION & INVITES ───
  // Creates a real credentialed coach account (email + password) and an
  // immediately-approved coaches row — no admin approval / pending step.
  // Mirrors the client email-signup pattern: if Supabase requires email
  // confirmation, signUp returns no session; the caller shows the "confirm
  // your email" message and the coach logs in once confirmed. Returns
  // { session, userId } so the caller can branch on confirmation state.
  async registerCoach({ email, name, password, experience, brand, certifications, social, location }) {
    email = (email || '').trim().toLowerCase();
    if (isSupabaseConfigured && supabase) {
      const signUpResult = await this.signUp(email, password);
      const userId = signUpResult?.user?.id;
      if (!userId) {
        throw new Error('Could not create your coach account. Please try again.');
      }

      // public.users.id is a separate, randomly-generated uuid — never the auth
      // uid (userId above) — so this must upsert by EMAIL, never force id:
      // userId. Forcing id here previously could collide with an existing row
      // for this email under a different id (duplicate key on the email
      // unique constraint). See the identical fix + full explanation in
      // api/register-coach.js (the live coach-signup path).
      // Raw PostgREST (restUpsert) instead of supabase.from() — same
      // SDK-hang bypass as everywhere else in this file.
      let userRow = null;
      try {
        userRow = await restUpsert('users', { email, full_name: name, role: 'coach' }, 'email');
      } catch (userErr) {
        console.warn('Cloud DB: could not sync coach users row:', userErr);
      }
      const publicUserId = userRow?.id || userId;

      // Create the approved coaches row with all profile fields.
      const expYears = parseInt(experience, 10);
      try {
        await restUpsert('coaches', {
          user_id: publicUserId,
          status: 'approved',
          brand_name: brand || `${name} Fitness`,
          experience_years: Number.isFinite(expYears) ? expYears : null,
          is_blocked: false,
          certifications: certifications || null,
          social_media_handle: social || null,
          location_city: location || null
        }, 'user_id');
      } catch (coachErr) {
        throw new Error(coachErr.message || 'Could not save your coach profile.');
      }

      return { session: signUpResult?.session || null, userId: publicUserId };
    }

    // Mock fallback
    const mockUsers = this.getMockTable('users');
    let mUser = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!mUser) {
      mUser = { id: `mock-uid-${Date.now()}`, email, auth_provider: 'email', password_hash: password };
      mockUsers.push(mUser);
    } else {
      mUser.password_hash = password;
    }
    this.saveMockTable('users', mockUsers);

    const mockCoaches = this.getMockTable('coaches');
    if (!mockCoaches.find(c => c.user_id === mUser.id)) {
      const expYears = parseInt(experience, 10);
      mockCoaches.push({
        id: `coach-${Date.now()}`,
        user_id: mUser.id,
        status: 'approved',
        brand_name: brand || `${name} Fitness`,
        experience_years: Number.isFinite(expYears) ? expYears : null,
        is_blocked: false
      });
      this.saveMockTable('coaches', mockCoaches);
    }
    return { session: { mock: true }, userId: mUser.id };
  },

  // Super-admin: block or unblock a coach by their user_id. Enforced at login.
  async setCoachBlocked(coachUserId, blocked) {
    if (isSupabaseConfigured && supabase) {
      // Raw PostgREST (restUpdate) instead of supabase.from() — same
      // SDK-hang bypass as everywhere else in this file.
      try {
        await restUpdate(`coaches?user_id=eq.${encodeURIComponent(coachUserId)}`, { is_blocked: blocked });
      } catch (error) {
        throw new Error(error.message || 'Could not update coach block status.');
      }
      return true;
    }
    const mockCoaches = this.getMockTable('coaches');
    const c = mockCoaches.find(mc => mc.user_id === coachUserId);
    if (c) { c.is_blocked = blocked; this.saveMockTable('coaches', mockCoaches); }
    return true;
  },

  async getPendingCoachApplications() {
    let cloudPending = [];
    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (restSelect) instead of supabase.from() — same
        // SDK-hang bypass as everywhere else in this file.
        const data = await restSelect(`coach_applications?select=*,users(email)&status=eq.pending`);
        if (data) {
          cloudPending = data.map(app => ({
            id: app.user_id, // keep mapped to user_id for approval handler compatibility
            application_id: app.id,
            email: app.users?.email || '',
            full_name: app.full_name,
            phone_number: app.phone_number,
            experience_notes: app.experience_notes,
            status: app.status
          }));
        }
      } catch (e) {
        console.error('Cloud DB fetch pending coaches error:', e);
      }
    }

    const mockApps = this.getMockTable('coach_applications').filter(a => a.status === 'pending');
    const mockUsers = this.getMockTable('users');

    const mappedMock = mockApps.map(app => {
      const u = mockUsers.find(user => user.id === app.user_id);
      return {
        id: app.user_id,
        application_id: app.id,
        email: u?.email || '',
        full_name: app.full_name,
        phone_number: app.phone_number,
        experience_notes: app.experience_notes,
        status: app.status
      };
    });

    const merged = [...cloudPending];
    mappedMock.forEach(m => {
      if (!merged.find(item => item.email.toLowerCase() === m.email.toLowerCase())) {
        merged.push(m);
      }
    });

    return merged;
  },

  async approveCoach(email) {
    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (restSelect/restUpdate/restInsert) instead of
        // supabase.from() — same SDK-hang bypass as everywhere else in this
        // file.
        const userRows = await restSelect(`users?email=eq.${encodeURIComponent(email)}&select=id`);
        const user = userRows[0] || null;

        if (user) {
          await restUpdate(`users?id=eq.${encodeURIComponent(user.id)}`, { role: 'coach' });

          // Update coach applications
          await restUpdate(`coach_applications?user_id=eq.${encodeURIComponent(user.id)}`, {
            status: 'approved',
            reviewed_at: new Date().toISOString()
          });

          // Create row in coaches table
          const existingCoachRows = await restSelect(`coaches?user_id=eq.${encodeURIComponent(user.id)}&select=id`);

          if (!existingCoachRows[0]) {
            await restInsert('coaches', {
              user_id: user.id,
              status: 'approved',
              brand_name: 'Fit Engineers Coach'
            });
          } else {
            await restUpdate(`coaches?user_id=eq.${encodeURIComponent(user.id)}`, { status: 'approved' });
          }
        }
      } catch (e) {
        console.error('Cloud DB Approve Coach Error:', e);
      }
    }

    // Mock Update
    const mockUsers = this.getMockTable('users');
    const mUser = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (mUser) {
      mUser.role = 'coach';
      this.saveMockTable('users', mockUsers);

      const mockApps = this.getMockTable('coach_applications');
      const updatedApps = mockApps.map(a => a.user_id === mUser.id ? { ...a, status: 'approved', reviewed_at: new Date().toISOString() } : a);
      this.saveMockTable('coach_applications', updatedApps);

      const mockCoaches = this.getMockTable('coaches');
      const existing = mockCoaches.find(c => c.user_id === mUser.id);
      if (!existing) {
        mockCoaches.push({
          id: `coach-id-${Date.now()}`,
          user_id: mUser.id,
          status: 'approved',
          brand_name: 'Fit Engineers Coach'
        });
      } else {
        existing.status = 'approved';
      }
      this.saveMockTable('coaches', mockCoaches);
    }
  },

  async rejectCoach(email) {
    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (restSelect/restUpdate) instead of supabase.from() —
        // same SDK-hang bypass as everywhere else in this file.
        const userRows = await restSelect(`users?email=eq.${encodeURIComponent(email)}&select=id`);
        const user = userRows[0] || null;

        if (user) {
          // Update coach applications
          await restUpdate(`coach_applications?user_id=eq.${encodeURIComponent(user.id)}`, {
            status: 'rejected',
            reviewed_at: new Date().toISOString()
          });

          // Update coaches status if exists
          await restUpdate(`coaches?user_id=eq.${encodeURIComponent(user.id)}`, { status: 'rejected' });
        }
      } catch (e) {
        console.error('Cloud DB Reject Coach Error:', e);
      }
    }

    // Mock Update
    const mockUsers = this.getMockTable('users');
    const mUser = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (mUser) {
      const mockApps = this.getMockTable('coach_applications');
      const updatedApps = mockApps.map(a => a.user_id === mUser.id ? { ...a, status: 'rejected', reviewed_at: new Date().toISOString() } : a);
      this.saveMockTable('coach_applications', updatedApps);

      const mockCoaches = this.getMockTable('coaches');
      const updatedCoaches = mockCoaches.map(c => c.user_id === mUser.id ? { ...c, status: 'rejected' } : c);
      this.saveMockTable('coaches', updatedCoaches);
    }
  },

  async resolveCoachUserId(coachId) {
    const rawCoachId = String(coachId || '').trim();
    if (!rawCoachId) {
      throw new Error('Coach account could not be identified.');
    }

    if (UUID_RE.test(rawCoachId)) {
      return rawCoachId;
    }

    if (isSupabaseConfigured && supabase) {
      const email = rawCoachId.toLowerCase();
      // Raw PostgREST (SDK-hang/RLS bypass, same as restSelect elsewhere in
      // this file) instead of supabase.from('users').select() — that SDK
      // call runs with whatever session state the SDK client currently has,
      // which on this project is the exact thing that goes stale/null (see
      // restSelect's comment above), sending the request out under
      // auth.uid() = NULL and getting rejected/emptied by the "Users can
      // read their own data"-style RLS policy even for a coach reading their
      // own row. restSelect instead resolves a real, freshly-checked bearer
      // token before the request. Confirmed cause of "Generate Code"
      // throwing "Coach profile is not synced yet" for a legitimately
      // logged-in coach whose cached localStorage 'userId' was missing/stale
      // (2026-08-09).
      const rows = await restSelect(`users?email=eq.${encodeURIComponent(email)}&select=id`);
      const userId = Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
      if (userId) {
        return userId;
      }

      // Fall back to the auth UID from the locally persisted session instead
      // of supabase.auth.getUser() — that call also goes through the SDK's
      // own (occasionally hanging) session machinery. readStoredSupabaseSession
      // just reads the same localStorage session supabase-js already
      // persisted, so it can't hang and doesn't depend on cachedAccessToken
      // being warm yet.
      const stored = readStoredSupabaseSession();
      const authUser = stored?.session?.user;
      if (authUser?.id && (!authUser.email || authUser.email.toLowerCase() === email)) {
        return authUser.id;
      }

      throw new Error('Coach profile is not synced yet. Please sign in again before generating an invitation code.');
    }

    const mockUsers = this.getMockTable('users');
    const user = mockUsers.find(u => u.email?.toLowerCase() === rawCoachId.toLowerCase() || u.id === rawCoachId);
    return user?.id || rawCoachId;
  },

  async isActiveCoachUser(coachUserId) {
    if (!coachUserId) return false;

    if (isSupabaseConfigured && supabase) {
      // Raw PostgREST (restSelect) instead of supabase.from() — same
      // SDK-hang bypass as everywhere else in this file.
      const userRows = await restSelect(`users?id=eq.${encodeURIComponent(coachUserId)}&select=email,role`);
      const user = userRows[0] || null;

      const coachRows = await restSelect(`coaches?user_id=eq.${encodeURIComponent(coachUserId)}&select=status`);
      const coach = coachRows[0] || null;

      return !!user && (
        ['coach', 'super-admin', 'admin'].includes(user.role) ||
        coach?.status === 'approved' ||
        isSuperAdmin(user.email)
      );
    }

    const mockUsers = this.getMockTable('users');
    const mockCoaches = this.getMockTable('coaches');
    const user = mockUsers.find(u => u.id === coachUserId);
    const coach = mockCoaches.find(c => c.user_id === coachUserId || c.id === coachUserId);
    return !!user && (
      ['coach', 'super-admin', 'admin'].includes(user.role) ||
      coach?.status === 'approved' ||
      isSuperAdmin(user.email)
    );
  },

  async updateInvitationUsage(upperCode, used, clientId = null) {
    // Raw-fetch (SDK-hang bypass — see restRpc's comment). This is the
    // "revert an invite back to unused" path called when
    // linkCoachAndEnterTransaction's post-transaction verification fails;
    // it must never be able to hang either, or that failure-recovery path
    // becomes its own stuck-forever spinner.
    const usage = used
      ? { used: true, used_at: new Date().toISOString(), used_by: clientId }
      : { used: false, used_at: null, used_by: null };

    let query = `invitations?code=eq.${encodeURIComponent(upperCode)}`;
    if (used) query += '&used=eq.false';

    try {
      return await restUpdate(query, usage);
    } catch (err) {
      // Fallback: some deployments' invitations table may not have used_at/used_by.
      return await restUpdate(query, { used });
    }
  },

  async getActiveCoachInviteCode(coachId) {
    const resolvedCoachId = await this.resolveCoachUserId(coachId);
    const now = new Date().toISOString();

    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (SDK-hang bypass, same as restSelect elsewhere in
        // this file) instead of supabase.from('invitations').select() — that
        // SDK call is the exact one documented to hang on this project, so
        // the coach dashboard's "Active Code" mount-time fetch could simply
        // never resolve, silently freezing the display on whatever stale
        // value localStorage last held (never erroring, so no catch fired
        // either) — the reported "invite code not refreshed" (2026-08-09).
        const rows = await restSelect(
          `invitations?select=*&coach_id=eq.${encodeURIComponent(resolvedCoachId)}` +
          `&used=eq.false&expires_at=gt.${encodeURIComponent(now)}&order=created_at.desc&limit=1`
        );
        return (rows && rows[0]) || null;
      } catch (err) {
        console.error('[ERROR] Failed to fetch active invite code from Supabase:', err);
        return null;
      }
    }

    // Local Storage fallback
    const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
    const activeCode = Object.keys(invites).find(code => {
      const invitation = invites[code];
      return invitation.coachId === resolvedCoachId && !invitation.used && invitation.expiresAt > now;
    });

    if (activeCode) {
      return { code: activeCode, ...invites[activeCode] };
    }
    return null;
  },

  async deactivateActiveCoachInviteCodes(coachId) {
    const resolvedCoachId = await this.resolveCoachUserId(coachId);
    const now = new Date().toISOString();

    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (SDK-hang bypass, same as restUpdate elsewhere in
        // this file) instead of supabase.from('invitations').update() — same
        // hang risk as getActiveCoachInviteCode above. A hang here meant
        // "Generate Code" could sit on this await forever, or (if it lost the
        // race and got abandoned) leave the old code un-deactivated in the
        // DB while the UI moved on to showing the new one.
        await restUpdate(
          `invitations?coach_id=eq.${encodeURIComponent(resolvedCoachId)}` +
          `&used=eq.false&expires_at=gt.${encodeURIComponent(now)}`,
          { expires_at: now }
        );
      } catch (err) {
        console.error('[ERROR] Failed to deactivate old invite codes in Supabase:', err);
      }
    } else {
      // Local Storage fallback
      const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
      let updated = false;
      for (const code in invites) {
        const invitation = invites[code];
        if (invitation.coachId === resolvedCoachId && !invitation.used && invitation.expiresAt > now) {
          invitation.expiresAt = now;
          updated = true;
        }
      }
      if (updated) {
        localStorage.setItem('coach_invites', JSON.stringify(invites));
      }
    }
  },

  async generateCoachInviteCode(coachId) {
    const resolvedCoachId = await this.resolveCoachUserId(coachId);
    const expiresAt = new Date(Date.now() + INVITE_CODE_TTL_MS).toISOString();

    if (isSupabaseConfigured && supabase) {
      if (!UUID_RE.test(resolvedCoachId)) {
        throw new Error('Coach profile is not linked to a valid database user.');
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = createInviteCode();
        try {
          // Raw PostgREST insert (SDK-hang/RLS bypass, same as restInsert's
          // other callers) instead of supabase.from('invitations').insert() —
          // that SDK call carries whatever session the SDK client happens to
          // have live, which is the same stale/null-auth.uid() failure mode
          // documented on restSelect above, and surfaced here as a 42501 RLS
          // violation on this insert (2026-08-09).
          await restInsert('invitations', {
            code,
            coach_id: resolvedCoachId,
            expires_at: expiresAt,
            used: false
          });
          console.log('[DEBUG] Cloud DB: Stored invitation code successfully.', {
            code,
            coach_id: resolvedCoachId,
            expires_at: expiresAt,
            generated_at: new Date().toISOString()
          });
          return code;
        } catch (err) {
          if (String(err.message || '').includes('23505')) {
            continue;
          }
          console.error('[ERROR] Failed to write coach invite code to Supabase:', err);
          throw new Error(err.message || 'Could not store invitation code. Please try again.');
        }
      }

      throw new Error('Could not generate a unique invitation code. Please try again.');
    }

    const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
    let code = createInviteCode();
    while (invites[code]) {
      code = createInviteCode();
    }

    invites[code] = {
      coachId: resolvedCoachId,
      expiresAt,
      used: false
    };
    localStorage.setItem('coach_invites', JSON.stringify(invites));
    console.log('[DEBUG] Local Storage: Stored invitation code successfully.', {
      code,
      coach_id: resolvedCoachId,
      expires_at: expiresAt,
      generated_at: new Date().toISOString()
    });

    return code;
  },

  async validateCoachInviteCode(code) {
    const upperCode = normalizeInviteCode(code);
    if (!upperCode) return null;

    // Debug Requirement: Log exact query path, searched document ID
    console.log('[DEBUG] Query Path: public.invitations');
    console.log('[DEBUG] Query Document ID:', upperCode);

    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (restSelect) instead of supabase.from() — same
        // SDK-hang bypass as everywhere else in this file.
        const rows = await restSelect(`invitations?code=eq.${encodeURIComponent(upperCode)}&used=eq.false&select=*`);
        const invite = rows[0] || null;

        if (!invite) {
          console.log('[DEBUG] Query Result: null');
          return null;
        }

        console.log('[DEBUG] Query Result:', JSON.stringify(invite));

        // Timezone comparison logs
        console.log('[DEBUG] Invitation code expiration time (UTC):', invite.expires_at);
        console.log('[DEBUG] Current validation time (UTC):', new Date().toISOString());

        if (isPastTimestamp(invite.expires_at)) {
          console.log('[DEBUG] Code expired. Expiration:', invite.expires_at, 'Now:', new Date().toISOString());
          return null;
        }

        return invite.coach_id;
      } catch (err) {
        console.error('[ERROR] Error validating invite code in Supabase:', err);
        return null;
      }
    } else {
      // Local Storage Fallback
      const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
      const invitation = invites[upperCode];

      if (!invitation || invitation.used) {
        console.log('[DEBUG] Query Result: null');
        return null;
      }

      console.log('[DEBUG] Query Result:', JSON.stringify(invitation));

      console.log('[DEBUG] Invitation code expiration time (UTC):', invitation.expiresAt);
      console.log('[DEBUG] Current validation time (UTC):', new Date().toISOString());

      if (isPastTimestamp(invitation.expiresAt)) {
        console.log('[DEBUG] Code expired. Expiration:', invitation.expiresAt, 'Now:', new Date().toISOString());
        return null;
      }

      return invitation.coachId;
    }
  },

  async consumeCoachInviteCode(code, clientId = null) {
    const upperCode = normalizeInviteCode(code);
    if (!upperCode) return;

    if (isSupabaseConfigured && supabase) {
      try {
        await this.updateInvitationUsage(upperCode, true, clientId);
        console.log('[DEBUG] Cloud DB: Successfully consumed invitation code:', upperCode);
      } catch (err) {
        console.error('[ERROR] Failed to mark invite code as used in Supabase:', err);
        throw err;
      }
    } else {
      // Local Storage Fallback
      const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
      if (invites[upperCode]) {
        invites[upperCode].used = true;
        invites[upperCode].usedAt = new Date().toISOString();
        invites[upperCode].usedBy = clientId;
        localStorage.setItem('coach_invites', JSON.stringify(invites));
        console.log('[DEBUG] Local Storage: Successfully consumed invitation code:', upperCode);
      }
    }
  },

  async linkCoachAndEnterDirect(upperCode, clientId) {
    // Same SDK-hang bypass as connectClientToCoach/linkCoachAndEnterTransaction
    // (see restSelect's comment) — this function has no current callers in the
    // UI, but it shares the exact same connect-to-coach invite lookup pattern
    // that hung for real clients elsewhere, so it's fixed here too rather than
    // left as a landmine for whenever it's next wired up.
    const rows = await restSelect(`invitations?code=eq.${encodeURIComponent(upperCode)}&limit=1`);
    const invite = Array.isArray(rows) ? rows[0] : null;

    if (!invite) throw new Error('Invalid invitation code.');
    if (invite.used) throw new Error('Invitation code has already been used.');

    console.log('[DEBUG] Direct invite validation result:', JSON.stringify(invite));
    console.log('[DEBUG] Invitation code expiration time (UTC):', invite.expires_at);
    console.log('[DEBUG] Current validation time (UTC):', new Date().toISOString());

    if (isPastTimestamp(invite.expires_at)) {
      throw new Error('Invitation code has expired.');
    }

    const coachIsActive = await this.isActiveCoachUser(invite.coach_id);
    if (!coachIsActive) {
      throw new Error('Invitation belongs to an inactive or invalid coach.');
    }

    // Only carry a real name into the connect write — never overwrite an
    // existing name with the "Warrior" placeholder (or blank). When the name
    // is a default, we omit full_name entirely so upsert/update leaves any
    // already-saved real name untouched; the wizard/profile is the source of
    // truth for the name, not this connect step.
    const storedName = (localStorage.getItem('userName') || '').trim();
    const realName = storedName && storedName.toLowerCase() !== 'warrior' ? storedName : null;

    // Raw PostgREST (restUpsert/restUpdate/restSelect) instead of
    // supabase.from() — same SDK-hang bypass as everywhere else in this file.
    const clientRow = { user_id: clientId, coach_id: invite.coach_id };
    if (realName) clientRow.full_name = realName;
    await restUpsert('clients', clientRow, 'user_id');

    const userUpdate = { role: 'client', coach_id: invite.coach_id, verified: true };
    if (realName) userUpdate.full_name = realName;
    try {
      await restUpdate(`users?id=eq.${encodeURIComponent(clientId)}`, userUpdate);
    } catch (userError) {
      const { verified, ...userUpdateNoVerified } = userUpdate;
      await restUpdate(`users?id=eq.${encodeURIComponent(clientId)}`, userUpdateNoVerified);
    }

    const consumedInvite = await this.updateInvitationUsage(upperCode, true, clientId);
    if (!consumedInvite) {
      throw new Error('Invitation code has already been used.');
    }

    const verifyClientRows = await restSelect(`clients?user_id=eq.${encodeURIComponent(clientId)}&select=*`);
    const verifyClient = verifyClientRows[0] || null;
    const verifyUserRows = await restSelect(`users?id=eq.${encodeURIComponent(clientId)}&select=*`);
    const verifyUser = verifyUserRows[0] || null;

    if (verifyClient?.coach_id !== invite.coach_id || verifyUser?.coach_id !== invite.coach_id) {
      await this.updateInvitationUsage(upperCode, false);
      throw new Error('Database transaction verification failed. Link reverted to prevent user lockout.');
    }

    return {
      success: true,
      coach_id: invite.coach_id,
      client_id: clientId,
      code_used: upperCode
    };
  },

  async linkCoachAndEnterTransaction(code, clientId) {
    const upperCode = normalizeInviteCode(code);
    if (!upperCode || !clientId) throw new Error('Code and Client ID are required.');

    if (isSupabaseConfigured && supabase) {
      try {
        // SECURITY/RELIABILITY BUG FIX (2026-07-09): this used to call
        // supabase.rpc(...) and supabase.from().select() (the SDK client) —
        // the SDK hangs silently on this project (see
        // feedback-supabase-sdk-hang memory), and this function had ZERO
        // timeout protection anywhere. When it hung, the "Connect to Coach"
        // modal's "Connecting..." spinner had no way out, ever — confirmed
        // 2026-07-09 for a real client entering a real invite code. Every
        // Supabase call in this function now goes through the raw-fetch +
        // AbortController helpers (restRpc / restSelect) that the rest of
        // this codebase already relies on for exactly this reason.
        console.log('[DEBUG] Executing atomic transaction RPC: link_coach_and_enter_transaction');
        let data;
        try {
          data = await restRpc('link_coach_and_enter_transaction', {
            p_invite_code: upperCode,
            p_client_id: clientId
          });
        } catch (rpcErr) {
          console.error('[ERROR] RPC failed:', rpcErr.message || rpcErr);
          throw new Error(rpcErr.message || 'Database transaction failed.');
        }

        if (data && !data.success) {
          console.error('[ERROR] RPC transaction failed:', data.error);
          throw new Error(data.error || 'Database transaction failed.');
        }

        console.log('[DEBUG] Transaction RPC successful:', JSON.stringify(data));

        // ─── POST-TRANSACTION VERIFICATION (SELF-HEALING CHECK) ───
        console.log('[DEBUG] Starting post-transaction verification...');

        // These three are independent reads — run them in parallel so the
        // worst-case wait is one timeout window, not three stacked.
        const [inviteRows, clientRows, userRows] = await Promise.all([
          restSelect(`invitations?code=eq.${encodeURIComponent(upperCode)}&limit=1`),
          restSelect(`clients?user_id=eq.${encodeURIComponent(clientId)}&limit=1`),
          restSelect(`users?id=eq.${encodeURIComponent(clientId)}&limit=1`)
        ]);
        const verifyInvite = Array.isArray(inviteRows) ? inviteRows[0] : null;
        const verifyClient = Array.isArray(clientRows) ? clientRows[0] : null;
        const verifyUser = Array.isArray(userRows) ? userRows[0] : null;

        const hasUsedByColumn = verifyInvite && Object.prototype.hasOwnProperty.call(verifyInvite, 'used_by');
        const hasInvite = verifyInvite && verifyInvite.used === true && (!hasUsedByColumn || verifyInvite.used_by === clientId);
        const hasClient = verifyClient && verifyClient.coach_id === verifyInvite?.coach_id;
        const hasUser = verifyUser && verifyUser.role === 'client' && verifyUser.coach_id === verifyInvite?.coach_id && verifyUser.payment_status === 'active';

        if (!hasInvite || !hasClient || !hasUser) {
          console.error('[CRITICAL ERROR] Post-transaction consistency verification FAILED!', {
            hasInvite,
            hasClient,
            hasUser,
            verifyInvite,
            verifyClient,
            verifyUser
          });

          console.log('[DEBUG] Restoring invitation status to unused...');
          await this.updateInvitationUsage(upperCode, false);

          throw new Error('Database transaction verification failed. Link reverted to prevent user lockout.');
        }

        console.log('[DEBUG] Post-transaction verification: ALL CHECKS PASSED.');
        return data;

      } catch (err) {
        console.error('[ERROR] linkCoachAndEnterTransaction failed:', err.message || err);
        throw err;
      }
    } else {
      // Local Storage Fallback Transaction (Simulated Atomicity)
      const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
      const invitation = invites[upperCode];

      if (!invitation) {
        throw new Error('Invalid invitation code.');
      }
      if (invitation.used) {
        throw new Error('Invitation code has already been used.');
      }
      if (isPastTimestamp(invitation.expiresAt)) {
        throw new Error('Invitation code has expired.');
      }

      // Check active coach
      const coachIsActive = await this.isActiveCoachUser(invitation.coachId);
      if (!coachIsActive) {
        throw new Error('Invitation belongs to an inactive or invalid coach.');
      }

      // Create/update client profile before consuming the invitation.
      const mockUsers = this.getMockTable('users');
      const mockClients = this.getMockTable('clients');
      const clientIdx = mockClients.findIndex(c => c.user_id === clientId);
      const now = new Date().toISOString();
      const newClientObj = {
        user_id: clientId,
        coach_id: invitation.coachId,
        full_name: localStorage.getItem('userName') || 'Warrior',
        linked_at: now
      };

      if (clientIdx >= 0) {
        mockClients[clientIdx] = { ...mockClients[clientIdx], ...newClientObj };
      } else {
        mockClients.push(newClientObj);
      }
      this.saveMockTable('clients', mockClients);

      const userIdx = mockUsers.findIndex(u => u.id === clientId);
      if (userIdx >= 0) {
        mockUsers[userIdx].role = 'client';
        mockUsers[userIdx].coach_id = invitation.coachId;
        this.saveMockTable('users', mockUsers);
      }

      invitation.used = true;
      invitation.usedAt = now;
      invitation.usedBy = clientId;
      localStorage.setItem('coach_invites', JSON.stringify(invites));

      // Simulated Post-Transaction Verification
      const mockVerifyInvite = JSON.parse(localStorage.getItem('coach_invites') || '{}')[upperCode];
      const mockVerifyClient = this.getMockTable('clients').find(c => c.user_id === clientId);
      const mockVerifyUser = this.getMockTable('users').find(u => u.id === clientId);

      const passInvite = mockVerifyInvite && mockVerifyInvite.used === true && mockVerifyInvite.usedBy === clientId;
      const passClient = mockVerifyClient && mockVerifyClient.coach_id === invitation.coachId;
      const passUser = mockVerifyUser && mockVerifyUser.role === 'client' && mockVerifyUser.coach_id === invitation.coachId;

      if (!passInvite || !passClient || !passUser) {
        // Rollback
        invitation.used = false;
        invitation.usedAt = null;
        invitation.usedBy = null;
        localStorage.setItem('coach_invites', JSON.stringify(invites));
        throw new Error('Local mock verification failed. Changes rolled back.');
      }

      return {
        success: true,
        coach_id: invitation.coachId,
        client_id: clientId,
        code_used: upperCode
      };
    }
  },

  // ─── CONNECT CLIENT TO COACH FROM DASHBOARD ───
  // This is the ONLY method the new dashboard modal should call.
  // userId is ALWAYS taken from localStorage (the authenticated session) —
  // never from a user-supplied form field. This directly prevents the
  // "Code and Client ID are required" bug.
  async connectClientToCoach(rawCode) {
    const code = normalizeInviteCode(rawCode);
    if (!code) return { success: false, error: 'Please enter a valid invitation code.' };

    // Resolve client's own public.users.id from the authenticated session.
    // NOTE: never store session.user.id here — that's the Supabase auth UID,
    // which is a DIFFERENT value from public.users.id on this project and would
    // poison localStorage so the client can't see their own coach link
    // afterward (see resolveCanonicalUserId). Always resolve by email.
    let clientId = await resolveCanonicalUserId();

    // If still unresolved (no cached userId AND no userEmail), fall back to the
    // auth session's EMAIL — again, the email, not the auth uid. Reads the
    // persisted session directly (same helper resolveBearerToken/
    // refreshAccessTokenRaw use) rather than supabase.auth.getSession() —
    // this file's own top comment warns that calling any supabase.auth.*
    // session method from inside a helper like this reintroduces the SDK's
    // token-refresh hang, since getSession() can trigger the same stuck
    // refresh restSelect/resolveBearerToken were built specifically to
    // avoid. A client landing in this exact fallback (no cached userId AND
    // no cached userEmail — e.g. a fresh install or cleared storage) would
    // have hung here indefinitely with no timeout and no error, leaving
    // "Connect to Coach" stuck on whatever loading state called it. Confirmed
    // 2026-08-25 — this call violated the very rule documented at the top of
    // this file.
    if (!clientId && isSupabaseConfigured && supabase) {
      try {
        const stored = readStoredSupabaseSession();
        const authEmail = (stored?.session?.user?.email || '').trim().toLowerCase();
        if (authEmail) {
          const rows = await restSelect(`users?email=eq.${encodeURIComponent(authEmail)}&select=id`);
          clientId = (Array.isArray(rows) && rows[0]?.id) ? rows[0].id : null;
          if (clientId) localStorage.setItem('userId', clientId);
        }
      } catch (e) {
        console.error('[connectClientToCoach] Could not resolve userId from session:', e);
      }
    }

    if (!clientId) {
      return { success: false, error: 'Your session could not be verified. Please log out and log back in.' };
    }

    // Step 1: Validate the code before committing anything.
    //
    // For Supabase, this used to pre-check the code with a plain restSelect
    // on `invitations` sent under the CLIENT's own session token. That read
    // is exactly what sql/lock_down_reads.sql's `invitations_select` policy
    // (coach_id = me OR used_by = me) is designed to block for a brand-new
    // client: they're neither the coach who owns the code nor (yet) the
    // used_by client, so the SELECT always came back zero rows — reporting a
    // perfectly valid, unused code as "Code not found." for every first-time
    // connect. Root-caused 2026-08-10 (regression from the 2026-08-08 RLS
    // lockdown, just never hit until then because dev auto-login/testing
    // mostly reused already-connected accounts).
    //
    // link_coach_and_enter_transaction (Step 2) is SECURITY DEFINER, so it
    // bypasses RLS and does this exact validation for real — it already
    // raises 'Invalid invitation code.' / '...already been used.' /
    // '...has expired.', which the catch block below already maps to the
    // same user-facing messages. So for Supabase we skip straight to Step 2
    // and let the RPC be the single source of truth; no separate read needed.
    if (!isSupabaseConfigured || !supabase) {
      // Mock DB validation
      const invites = JSON.parse(localStorage.getItem('coach_invites') || '{}');
      const invite = invites[code];
      if (!invite) return { success: false, error: 'Code not found.' };
      if (invite.used) return { success: false, error: 'This code has already been used.' };
      if (isPastTimestamp(invite.expiresAt)) return { success: false, error: 'This code has expired.' };
    }

    // Step 2: Execute the atomic link transaction
    try {
      const result = await this.linkCoachAndEnterTransaction(code, clientId);
      if (result && result.success) {
        // Update localStorage so the dashboard reflects the new connection immediately
        localStorage.setItem('userCoachId', result.coach_id || '');
        localStorage.setItem('clientLinkedToCoach', 'true');
        return { success: true, coachId: result.coach_id };
      }
      return { success: false, error: 'Connection failed. Please try again.' };
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('expired')) return { success: false, error: 'This code has expired.' };
      if (msg.includes('already been used')) return { success: false, error: 'This code has already been used.' };
      if (msg.includes('not found') || msg.includes('Invalid')) return { success: false, error: 'Code not found.' };
      return { success: false, error: msg || 'Connection failed. Please try again.' };
    }
  },

  async getAllUsersWithRoles() {
    let users = [];
    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (restSelect) instead of supabase.from() — same
        // SDK-hang bypass as everywhere else in this file.
        const dbUsers = await restSelect(`users?select=*&order=created_at.desc`);
        if (dbUsers) {
          // Query coaches
          const dbCoaches = await restSelect(`coaches?select=*`);
          // Query clients
          const dbClients = await restSelect(`clients?select=*`);
          // Query applications
          const dbApps = await restSelect(`coach_applications?select=*`);

          users = dbUsers.map(u => {
            const isSuperAdminEmail = u.email.toLowerCase() === 'subodhmankala@gmail.com';
            const coach = dbCoaches?.find(c => c.user_id === u.id);
            const client = dbClients?.find(c => c.user_id === u.id);
            const app = dbApps?.find(a => a.user_id === u.id);

            let role = 'client';
            if (isSuperAdminEmail) {
              role = 'super-admin';
            } else if (coach) {
              role = coach.status === 'approved' ? 'coach' : 'coach_pending';
            } else if (app && app.status === 'pending') {
              role = 'coach_pending';
            } else if (client) {
              role = 'client';
            }

            return {
              id: u.id,
              email: u.email,
              full_name: client?.full_name || coach?.brand_name || u.email.split('@')[0],
              phone: client?.phone_number || coach?.phone_number || app?.phone_number || '',
              role,
              verified: role === 'coach' || role === 'super-admin',
              created_at: u.created_at,
              last_login: u.last_login || null
            };
          });
        }
      } catch (e) {
        console.error('Cloud DB getAllUsersWithRoles error:', e);
      }
    }

    // Combine/fallback with Mock Table
    const mockUsers = this.getMockTable('users');
    const mockCoaches = this.getMockTable('coaches');
    const mockClients = this.getMockTable('clients');
    const mockApps = this.getMockTable('coach_applications');

    mockUsers.forEach(u => {
      if (!users.find(item => item.email.toLowerCase() === u.email.toLowerCase())) {
        const isSuperAdminEmail = u.email.toLowerCase() === 'subodhmankala@gmail.com';
        const coach = mockCoaches.find(c => c.user_id === u.id);
        const client = mockClients.find(c => c.user_id === u.id);
        const app = mockApps.find(a => a.user_id === u.id);

        let role = 'client';
        if (isSuperAdminEmail) {
          role = 'super-admin';
        } else if (coach) {
          role = coach.status === 'approved' ? 'coach' : 'coach_pending';
        } else if (app && app.status === 'pending') {
          role = 'coach_pending';
        } else if (client) {
          role = 'client';
        }

        users.push({
          id: u.id,
          email: u.email,
          full_name: client?.full_name || coach?.brand_name || u.email.split('@')[0],
          phone: client?.phone_number || coach?.phone_number || app?.phone_number || '',
          role,
          verified: role === 'coach' || role === 'super-admin',
          created_at: u.created_at || new Date().toISOString(),
          last_login: u.last_login || null
        });
      }
    });

    return users;
  },

  async requestMockPasswordReset(email) {
    const mockUsers = this.getMockTable('users');
    const u = mockUsers.find(user => user.email.toLowerCase() === email.toLowerCase().trim());
    if (u) {
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const mockTokens = this.getMockTable('password_reset_tokens');
      mockTokens.push({
        id: `token-id-${Date.now()}`,
        user_id: u.id,
        token: token,
        expires_at: expiresAt,
        used: false
      });
      this.saveMockTable('password_reset_tokens', mockTokens);
      return token;
    }
    return null;
  },

  async validateMockToken(token) {
    const mockTokens = this.getMockTable('password_reset_tokens');
    const t = mockTokens.find(tok => tok.token === token);
    if (!t) return { isValid: false, error: 'This link is invalid or has expired. Request a new one' };
    if (t.used) return { isValid: false, error: 'This link is invalid or has expired. Request a new one' };
    if (new Date(t.expires_at) < new Date()) return { isValid: false, error: 'This link is invalid or has expired. Request a new one' };
    return { isValid: true, tokenObj: t };
  },

  async resetMockPasswordWithToken(token, newPassword) {
    const validation = await this.validateMockToken(token);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }
    const t = validation.tokenObj;
    const mockUsers = this.getMockTable('users');
    const uIdx = mockUsers.findIndex(user => user.id === t.user_id);
    if (uIdx >= 0) {
      mockUsers[uIdx].password_hash = newPassword;
      this.saveMockTable('users', mockUsers);
    }
    const mockTokens = this.getMockTable('password_reset_tokens');
    const tIdx = mockTokens.findIndex(tok => tok.id === t.id);
    if (tIdx >= 0) {
      mockTokens[tIdx].used = true;
      this.saveMockTable('password_reset_tokens', mockTokens);
    }
    return true;
  },

  async refreshLocalCoaches() {
    const coaches = [];
    if (isSupabaseConfigured && supabase) {
      try {
        // Raw PostgREST (restSelect) instead of supabase.from() — same
        // SDK-hang bypass as everywhere else in this file.
        const data = await restSelect(`coaches?select=*,users(email,full_name)&status=eq.approved`);

        if (data) {
          data.forEach(c => {
            coaches.push({
              id: c.id,
              name: c.users?.full_name || c.brand_name || 'Coach',
              email: c.users?.email || '',
              brand: c.brand_name || 'Fit Engineers',
              payment_status: 'active',
              signup_date: c.created_at,
              clientsCount: 0,
              status: c.status
            });
          });
        }
      } catch (e) {
        console.error('Cloud DB refresh coaches error:', e);
      }
    }

    // Mock coaches
    const mockCoaches = this.getMockTable('coaches').filter(c => c.status === 'approved');
    const mockUsers = this.getMockTable('users');
    
    mockCoaches.forEach(c => {
      if (!coaches.find(item => item.id === c.id)) {
        const u = mockUsers.find(user => user.id === c.user_id);
        coaches.push({
          id: c.id,
          name: u?.full_name || c.brand_name || 'Coach',
          email: u?.email || '',
          brand: c.brand_name || 'Fit Engineers',
          payment_status: 'active',
          signup_date: c.created_at || new Date().toISOString(),
          clientsCount: 0,
          status: c.status
        });
      }
    });

    localStorage.setItem('coaches_list', JSON.stringify(coaches));
    try { window.dispatchEvent(new CustomEvent('coaches_updated', { detail: coaches })); } catch(e) {}
    return coaches;
  },

  // Seeding initial exercises library
  async seedExerciseLibrary() {
    // Initial preset exercises with full video and guide text
    const presets = [
      {
        name: 'Shoulders Press',
        category: 'Shoulders',
        primary_muscle: 'Deltoids',
        secondary_muscle: 'Triceps, Upper Chest',
        video_url: '/videos/shoulders-press.mp4',
        setup: 'Sit on a bench with back support. Hold dumbbells at shoulder height with an overhand grip, elbows bent at 90 degrees.',
        execution: 'Press the weights straight up above your head until your arms are fully extended. Lower slowly back to the starting point.',
        tip: 'Keep your core engaged and avoid arching your lower back as you press the weights overhead.'
      },
      {
        name: 'Biceps Curls',
        category: 'Arms',
        primary_muscle: 'Biceps',
        secondary_muscle: 'Brachialis, Brachioradialis',
        video_url: '/videos/biceps-curls.mp4',
        setup: 'Stand upright with feet shoulder-width apart, holding dumbbells at your sides with palms facing forward.',
        execution: 'Keep elbows close to your torso. Curl the weights while contracting your biceps. Lower slowly to full extension.',
        tip: 'Do not swing your body or use momentum. Keep your upper arms completely stationary during the movement.'
      },
      {
        name: 'One Arm Row',
        category: 'Back',
        primary_muscle: 'Latissimus Dorsi',
        secondary_muscle: 'Rhomboids, Trapezius, Biceps',
        video_url: '/videos/one-arm-row.mp4',
        setup: 'Place one knee and same-side hand on a flat bench. Hold a dumbbell in your opposite hand with your arm extended down.',
        execution: 'Pull the dumbbell up to your rib cage, keeping your elbow tucked close. Lower slowly back to start.',
        tip: 'Focus on drawing your elbow back rather than pulling with your forearm. Squeeze your lat at the top.'
      },
      {
        name: 'Flat Bench Press',
        category: 'Chest',
        primary_muscle: 'Pectorals',
        secondary_muscle: 'Triceps, Anterior Deltoids',
        video_url: '/videos/flat-bench-press.mp4',
        setup: 'Lie flat on a bench. Grip the barbell slightly wider than shoulder width. Feet flat on the floor.',
        execution: 'Unrack the bar. Lower it slowly to mid-chest. Press upward forcefully until arms are locked out.',
        tip: 'Keep your shoulder blades retracted and drive your feet into the floor to maintain tension.'
      },
      {
        name: 'Barbell Squat',
        category: 'Legs',
        primary_muscle: 'Quadriceps',
        secondary_muscle: 'Glutes, Hamstrings, Core',
        video_url: '/videos/barbell-squat.mp4',
        setup: 'Rest barbell on your upper back. Feet shoulder-width apart, toes pointed slightly outwards.',
        execution: 'Send hips back and bend knees to lower until thighs are parallel to the floor or lower. Press back to standing.',
        tip: 'Keep chest upright, knees tracking in line with toes, and drive through your heels.'
      },
      {
        name: 'Leg Extensions',
        category: 'Legs',
        primary_muscle: 'Quadriceps',
        secondary_muscle: 'None',
        video_url: '/videos/leg-extensions.mp4',
        setup: 'Sit in the extension machine. Place shins behind the padded roller. Grip side handles for support.',
        execution: 'Extend knees fully, squeezing quadriceps at the top. Lower the load under control to starting point.',
        tip: 'Do not allow your lower back to arch. Keep glutes firmly pressed into the seat.'
      },
      {
        name: 'Romanian Deadlift',
        category: 'Legs',
        primary_muscle: 'Hamstrings',
        secondary_muscle: 'Glutes, Lower Back',
        video_url: '/videos/romanian-deadlift.mp4',
        setup: 'Stand holding a barbell at hip height. Feet hip-width apart, knees slightly unlocked.',
        execution: 'Hinge forward at the hips, keeping back flat. Lower weight along thighs/shins until stretch is felt in hamstrings. Return to top.',
        tip: 'Ensure the bar remains close to your body and avoid bending the knees further during the descent.'
      },
      {
        name: 'Overhead Triceps Extension',
        category: 'Arms',
        primary_muscle: 'Triceps',
        secondary_muscle: 'Shoulders',
        video_url: '/videos/overhead-triceps-extension.mp4',
        setup: 'Hold a dumbbell with both hands overhead, arms fully extended.',
        execution: 'Keep elbows tucked in close. Lower the weight behind your head by bending elbows. Extend back to top.',
        tip: 'Ensure only your forearms move; your upper arms should remain stationary and vertical.'
      },
      {
        name: 'Hammer Curls',
        category: 'Arms',
        primary_muscle: 'Biceps',
        secondary_muscle: 'Brachialis, Forearms',
        video_url: '/videos/hammer-curls.mp4',
        setup: 'Stand upright with a dumbbell in each hand, palms facing each other (neutral grip).',
        execution: 'Keep upper arms stationary. Curl the weights forward while contracting biceps. Lower to starting point.',
        tip: 'Avoid swinging weights or using body momentum. Keep elbows close to your sides.'
      },
      {
        name: 'Plank',
        category: 'Core',
        primary_muscle: 'Core / Abs',
        secondary_muscle: 'Shoulders, Glutes',
        video_url: '/videos/plank.mp4',
        setup: 'Place forearms on floor, elbows aligned under shoulders. Extend legs straight back, resting on toes.',
        execution: 'Hold a straight line from head to heels. Contract abs, glutes, and thighs.',
        tip: 'Do not allow hips to sag or rise. Keep neck neutral by looking at the floor.'
      },
      {
        name: 'Hanging Leg Raises',
        category: 'Core',
        primary_muscle: 'Core / Abs',
        secondary_muscle: 'Hip Flexors, Grip Strength',
        video_url: '/videos/hanging-leg-raises.mp4',
        setup: 'Hang from a pull-up bar with arms fully extended, using an overhand grip.',
        execution: 'Keep legs straight. Raise them up until they are parallel to the floor or higher. Lower slowly under control.',
        tip: 'Minimize swinging. Engage your core before starting each rep.'
      },
      {
        name: 'Dumbbell Lateral Raises',
        category: 'Shoulders',
        primary_muscle: 'Side Delts',
        secondary_muscle: 'Trapezius',
        video_url: '/videos/dumbbell-lateral-raises.mp4',
        setup: 'Stand upright holding dumbbells at your sides, palms facing inwards.',
        execution: 'Raise arms out to the sides with a slight elbow bend, until parallel to the floor. Lower under control.',
        tip: 'Lead the movement with your elbows and avoid shrugging your shoulders at the top.'
      },
      {
        name: 'Pull-ups',
        category: 'Back',
        primary_muscle: 'Back / Lats',
        secondary_muscle: 'Biceps, Rear Delts',
        video_url: '/videos/pull-ups.mp4',
        setup: 'Grip pull-up bar with palms facing away from you, wider than shoulder-width.',
        execution: 'Pull your body up until your chin clears the bar. Lower slowly to a dead hang.',
        tip: 'Focus on driving your elbows down toward your ribs to engage your back muscles.'
      }
    ];

    // Read the general library names and merge them to fill out the seed data
    const exerciseLibraryModule = await import('../data/exerciseLibrary');
    const allLibrary = exerciseLibraryModule.EXERCISE_LIBRARY || [];

    const seedData = [...presets];

    // Add library exercises that aren't already covered in presets
    allLibrary.forEach(item => {
      if (!seedData.find(s => s.name.toLowerCase() === item.name.toLowerCase())) {
        seedData.push({
          name: item.name,
          category: item.category,
          primary_muscle: item.primary,
          secondary_muscle: '',
          video_url: '',
          setup: '',
          execution: '',
          tip: ''
        });
      }
    });

    if (seededOnce) {
      // Already confirmed non-empty (or seeded) once this session — skip
      // the emptiness-check round-trip entirely.
      return;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        // Emptiness check goes through restSelect (anon-key + timeout), not
        // the SDK client — .from().select() can hang indefinitely on this
        // project if the auth token needs a refresh (see restSelect comment
        // above). The exercises table's read RLS is public, so the anon key
        // is sufficient here regardless of the caller's own session state.
        const existing = await restSelect('exercises?select=id&limit=1');
        if (existing && existing.length > 0) {
          seededOnce = true;
        }
        if (!existing || existing.length === 0) {
          // Seed via /api/admin-write?action=seed-exercises, which verifies
          // the caller server-side before calling the admin_seed_exercises
          // SECURITY DEFINER RPC (see sql/exercises_table.sql) with the
          // service role key. Previously called the RPC directly via the
          // anon key with a client-supplied p_admin_email — anyone could
          // call that RPC themselves and just type the admin's email in, no
          // login required (confirmed exploitable 2026-08-30). See
          // api/admin-write.js.
          console.log('[seeding] Seeding exercises table in Supabase...');
          try {
            const accessToken = await resolveRealAccessToken();
            if (!accessToken) throw new Error('No verified session available to seed exercises.');
            const res = await fetch('/api/admin-write?action=seed-exercises', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({ exercises: seedData })
            });
            if (!res.ok) {
              const errData = await res.json().catch(() => null);
              throw new Error((errData && errData.error) || `Seed failed: ${res.status}`);
            }
            seededOnce = true;
          } catch (insertError) {
            console.error('[seeding] Supabase exercise seeding error:', insertError);
          }
        }
      } catch (err) {
        console.error('[seeding] Failed to seed Supabase exercises:', err);
      }
    } else {
      // Mock mode seeding
      const mockEx = this.getMockTable('exercises');
      if (mockEx.length === 0) {
        console.log('[seeding] Seeding mock_exercises table in localStorage...');
        const mockedSeed = seedData.map((item, index) => ({
          id: `ex-${index}-${Math.random().toString(36).substring(2, 6)}`,
          ...item,
          created_at: new Date().toISOString()
        }));
        this.saveMockTable('exercises', mockedSeed);
      }
      seededOnce = true;
    }
  },

  // Drops the in-memory exercise library cache so the next getExerciseLibrary()
  // call fetches fresh instead of returning stale data. Called after any write
  // (save/delete) so a newly-added exercise shows up without a full reload.
  invalidateExerciseLibraryCache() {
    exerciseLibraryCache = null;
    exerciseLibraryFetchPromise = null;
  },

  async getExerciseLibrary({ forceRefresh = false } = {}) {
    // Cached after the first successful fetch this session — the picker
    // modal used to re-fetch (seed check + full select, two round-trips)
    // on every open, which is what made "Add Exercise" feel like it took
    // ~3s to appear each time. In-flight requests are also de-duped via
    // exerciseLibraryFetchPromise so opening the modal twice quickly
    // doesn't fire two parallel fetches.
    if (!forceRefresh && exerciseLibraryCache) {
      return exerciseLibraryCache;
    }
    if (!forceRefresh && exerciseLibraryFetchPromise) {
      return exerciseLibraryFetchPromise;
    }

    const fetchPromise = (async () => {
      // Don't let a seed-check failure block reads — the table is very likely
      // already populated, and getExerciseLibrary() runs on every page load.
      await this.seedExerciseLibrary().catch(err =>
        console.warn('[exercises] seed check failed, continuing to read:', err)
      );

      let result;
      if (isSupabaseConfigured && supabase) {
        try {
          // restSelect instead of supabase.from().select() — see restSelect's
          // doc comment: the SDK client can hang forever waiting on an auth
          // token refresh, which previously made this screen stick at "0
          // exercises" with no error. restSelect has a hard timeout instead.
          const data = await restSelect('exercises?select=*&order=name.asc');
          result = data || [];
        } catch (err) {
          console.warn('Error fetching exercises via REST, falling back to local mocks:', err);
          const mockEx = this.getMockTable('exercises');
          result = mockEx.sort((a, b) => a.name.localeCompare(b.name));
        }
      } else {
        // Mock mode
        const mockEx = this.getMockTable('exercises');
        result = mockEx.sort((a, b) => a.name.localeCompare(b.name));
      }
      exerciseLibraryCache = result;
      return result;
    })();

    exerciseLibraryFetchPromise = fetchPromise;
    try {
      return await fetchPromise;
    } finally {
      exerciseLibraryFetchPromise = null;
    }
  },

  // ─── CUSTOM EXERCISES ───
  // A coach/client-created exercise from the Add Exercise picker's
  // "Create '{query}'" row — separate from the shared admin-curated
  // public.exercises catalog (saveExercise below), which stays admin-only.
  // See sql/supabase_custom_exercises.sql for the visibility rules this
  // enforces at the RLS layer (coach+that one client, or client-only-private).
  //
  // RLS scopes SELECT automatically based on the caller's real session
  // token, so no viewer params are needed here — restSelect already sends
  // that token (see restSelect's own doc comment).
  async getCustomExercisesForViewer() {
    const shape = (r) => ({
      id: r.id,
      name: r.name,
      equipment: r.equipment,
      category: r.category,
      primary_muscle: r.primary_muscle,
      secondary_muscle: Array.isArray(r.secondary_muscles) ? r.secondary_muscles.join(', ') : '',
      media_url: r.media_url,
      isCustom: true
    });
    try {
      const rows = await restSelect('custom_exercises?select=*&order=name.asc');
      if (Array.isArray(rows) && rows.length > 0) return rows.map(shape);
    } catch (e) {
      console.warn('Direct custom_exercises read failed, falling back to server route:', e);
    }
    // Fallback for accounts without a real auth.uid()-bearing session — same
    // RLS-vs-anon-key gap every other *ViaServer fallback in this file works
    // around (see api/data-read.js's custom-exercises-list comment).
    try {
      const token = await resolveBearerToken();
      const res = await fetch('/api/data-read?resource=custom-exercises-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: localStorage.getItem('userEmail') || '' })
      });
      const data = await res.json().catch(() => null);
      return (data && Array.isArray(data.exercises)) ? data.exercises.map(shape) : [];
    } catch (e) {
      console.warn('Failed to load custom exercises (non-fatal):', e);
      return [];
    }
  },

  // mode: 'coach' | 'client'. Coach mode requires coachId (their own id) and
  // clientUserId (the specific client they're working with, must be their
  // assigned client per RLS). Client mode ignores coachId and stamps
  // clientUserId as the caller's own id.
  async createCustomExercise({ name, equipment, category, primaryMuscle, secondaryMuscles, mediaUrl, mode, coachId, clientUserId }) {
    if (!name || !name.trim()) throw new Error('Exercise name is required.');
    const record = {
      name: name.trim(),
      equipment: equipment || null,
      category: category || null,
      primary_muscle: primaryMuscle || null,
      secondary_muscles: Array.isArray(secondaryMuscles) && secondaryMuscles.length > 0 ? secondaryMuscles : null,
      media_url: mediaUrl || null
    };
    if (mode === 'coach') {
      if (!coachId || !clientUserId) throw new Error('createCustomExercise (coach mode) requires coachId and clientUserId.');
      record.created_by_user_id = coachId;
      record.coach_id = coachId;
      record.client_user_id = clientUserId;
    } else {
      if (!clientUserId) throw new Error('createCustomExercise (client mode) requires clientUserId.');
      record.created_by_user_id = clientUserId;
      record.coach_id = null;
      record.client_user_id = clientUserId;
    }

    let inserted;
    try {
      inserted = await restInsert('custom_exercises', record);
    } catch (e) {
      // Same RLS-vs-anon-key gap as getCustomExercisesForViewer above — fall
      // back to the service-role create route instead of failing the save
      // outright. That route re-derives created_by_user_id/coach_id/
      // client_user_id itself from the verified caller identity (never
      // trusts the client-supplied ids directly), so it re-sends the same
      // inputs but the server decides what actually gets written.
      console.warn('Direct custom_exercises insert failed, falling back to server route:', e);
      const token = await resolveBearerToken();
      const res = await fetch('/api/data-read?resource=custom-exercises-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: localStorage.getItem('userEmail') || '',
          name: record.name,
          equipment: record.equipment,
          category: record.category,
          primaryMuscle: record.primary_muscle,
          secondaryMuscles: record.secondary_muscles,
          mode,
          coachId,
          clientUserId
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || 'Could not save this exercise.');
      inserted = data.exercise;
    }

    // Best-effort super-admin notification — never let a push hiccup fail
    // the actual save the coach/client is waiting on.
    try {
      await fetch('/api/push?action=notify-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'custom_exercise_created',
          clientUserId: record.client_user_id,
          exerciseName: record.name,
          creatorRole: mode,
          creatorName: localStorage.getItem('userName') || null
        })
      });
    } catch (e) {
      console.warn('custom_exercise_created notification failed (non-fatal):', e);
    }

    return inserted;
  },

  // Raw Storage REST upload into the custom-exercise-media bucket, sent with
  // the caller's real session bearer token so the row-owning viewer (not
  // just anyone with the anon key) is the one who actually attached it —
  // matches the write model uploadWorkoutMedia/uploadExerciseVideo already
  // use elsewhere in this file.
  async uploadCustomExerciseMedia(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
    const token = await resolveBearerToken();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), adaptiveTimeout(30000));
    try {
      const res = await fetch(`${supabaseUrl}/storage/v1/object/custom-exercise-media/${fileName}`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': file.type || 'application/octet-stream'
        },
        body: file,
        signal: controller.signal
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error((errData && (errData.message || errData.error)) || `Upload failed: ${res.status}`);
      }
    } finally {
      clearTimeout(timer);
    }

    return `${supabaseUrl}/storage/v1/object/public/custom-exercise-media/${fileName}`;
  },

  async saveExercise(exercise) {
    if (isSupabaseConfigured && supabase) {
      try {
        // Goes through /api/admin-write?action=save-exercise, which verifies
        // the caller server-side (must resolve to the super-admin account)
        // before calling the save_exercise SECURITY DEFINER RPC with the
        // service role key. Previously called the RPC directly via the anon
        // key with a client-supplied p_admin_email — anyone hitting that RPC
        // could just type the admin's email in themselves, no login required
        // (confirmed exploitable 2026-08-30). See api/admin-write.js.
        const accessToken = await resolveRealAccessToken();
        if (!accessToken) {
          throw new Error('Your session could not be verified. Please sign in again.');
        }
        const res = await fetch('/api/admin-write?action=save-exercise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ exercise })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data && data.error) || `Save failed: ${res.status}`);
        }
        this.invalidateExerciseLibraryCache();
        return data.exercise;
      } catch (err) {
        console.error('Error saving exercise to Supabase:', err);
        throw err;
      }
    } else {
      const mockEx = this.getMockTable('exercises');
      if (exercise.id) {
        const idx = mockEx.findIndex(e => e.id === exercise.id);
        if (idx !== -1) {
          mockEx[idx] = {
            ...mockEx[idx],
            name: exercise.name,
            category: exercise.category,
            primary_muscle: exercise.primary_muscle,
            secondary_muscle: exercise.secondary_muscle || '',
            video_url: exercise.video_url || '',
            setup: exercise.setup || '',
            execution: exercise.execution || '',
            tip: exercise.tip || ''
          };
          this.saveMockTable('exercises', mockEx);
          this.invalidateExerciseLibraryCache();
          return mockEx[idx];
        }
      } else {
        const newEx = {
          id: `ex-${Math.random().toString(36).substring(2, 9)}`,
          name: exercise.name,
          category: exercise.category,
          primary_muscle: exercise.primary_muscle,
          secondary_muscle: exercise.secondary_muscle || '',
          video_url: exercise.video_url || '',
          setup: exercise.setup || '',
          execution: exercise.execution || '',
          tip: exercise.tip || '',
          created_at: new Date().toISOString()
        };
        mockEx.push(newEx);
        this.saveMockTable('exercises', mockEx);
        this.invalidateExerciseLibraryCache();
        return newEx;
      }
    }
  },

  // Remove a duplicate/stale exercise from the shared catalog. Goes through
  // the delete_exercise SECURITY DEFINER RPC (see sql/exercises_table.sql) —
  // same anon-key + admin-email-guard write model as saveExercise, since the
  // exercises table denies all direct writes/deletes via RLS.
  async deleteExercise(id) {
    if (isSupabaseConfigured && supabase) {
      try {
        // Same /api/admin-write fix as saveExercise above — see its comment.
        const accessToken = await resolveRealAccessToken();
        if (!accessToken) {
          return { success: false, error: 'Your session could not be verified. Please sign in again.' };
        }
        const res = await fetch('/api/admin-write?action=delete-exercise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ id })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { success: false, error: (data && data.error) || 'Delete failed' };
        }
        this.invalidateExerciseLibraryCache();
        return { success: true };
      } catch (err) {
        console.error('Error deleting exercise from Supabase:', err);
        return { success: false, error: err.message || 'Delete failed' };
      }
    } else {
      const mockEx = this.getMockTable('exercises').filter(e => e.id !== id);
      this.saveMockTable('exercises', mockEx);
      this.invalidateExerciseLibraryCache();
      return { success: true };
    }
  },

  async uploadExerciseVideo(file) {
    if (isSupabaseConfigured && supabase) {
      try {
        // Raw Storage REST upload with the anon key. The exercise-videos
        // bucket's INSERT policy allows the anon role (see
        // sql/exercises_table.sql) — consistent with this app's anon-key
        // write model, since the coach login produces no auth JWT. Using
        // raw fetch (not supabase.storage.upload()) also sidesteps the SDK
        // session-hang issue, with a hard timeout.
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), adaptiveTimeout(30000));
        try {
          const res = await fetch(`${supabaseUrl}/storage/v1/object/exercise-videos/${fileName}`, {
            method: 'POST',
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              'Content-Type': file.type || 'application/octet-stream'
            },
            body: file,
            signal: controller.signal
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => null);
            throw new Error((errData && (errData.message || errData.error)) || `Upload failed: ${res.status}`);
          }
        } finally {
          clearTimeout(timer);
        }

        return `${supabaseUrl}/storage/v1/object/public/exercise-videos/${fileName}`;
      } catch (err) {
        console.error('Error uploading video to Supabase Storage:', err);
        throw err;
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 800));
      return `/videos/shoulders-press.mp4`;
    }
  }
};

export default databaseService;
