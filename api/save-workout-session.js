// Authoritative, RLS-proof workout_logs write, service-role-backed like
// complete-onboarding.js and lookup-profile.js.
//
// Why this exists: the browser writes workout_logs via restInsert() using the
// caller's own session token. workout_logs' INSERT policy is auth.uid()-based
// (not permissive), so any write attempted before that token is fully synced
// — or via the localhost "Continue with Google" mock, which never establishes
// a real Supabase session at all — is rejected outright with 42501 ("new row
// violates row-level security policy"), and the client had already updated
// its local session list, so the workout LOOKED saved with nothing to show
// otherwise. This is the same insert-vs-select RLS asymmetry documented for
// getUserProfileByEmail, on the write side for a different table.
//
// This endpoint is the fallback databaseService.saveWorkoutSession() reaches
// for whenever the direct client-side insert fails, so the save can still
// land even when the browser's session state is unreliable.

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }

  const { records } = req.body || {};
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'records must be a non-empty array' });
  }

  // Every record must target the same user; verify that user is who the
  // caller's token says they are (or matches the caller-supplied email on
  // localhost dev, same gate as lookup-profile.js) before writing anything.
  const targetUserId = records[0].user_id;
  if (!targetUserId || records.some(r => r.user_id !== targetUserId)) {
    return res.status(400).json({ error: 'All records must share the same user_id' });
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const bodyEmail = ((req.body || {}).email || '').trim().toLowerCase();

  const svcHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  // Kick the client-row lookup off NOW, in parallel with token verification
  // below: it only needs targetUserId (already read off the body), not the
  // caller's identity, so there is no reason to wait for the auth round trip
  // first. Never rejects, so an early 401/403 return can't strand it.
  const clientRowPromise = fetch(
    `${supabaseUrl}/rest/v1/clients?user_id=eq.${encodeURIComponent(targetUserId)}&select=coach_id`,
    { headers: svcHeaders }
  ).then(r => r.json()).catch(() => []);

  let verifiedEmail = null;
  if (accessToken && accessToken !== anonKey) {
    try {
      const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` }
      });
      if (userResp.ok) {
        const authUser = await userResp.json().catch(() => null);
        verifiedEmail = (authUser?.email || '').trim().toLowerCase() || null;
      }
    } catch (e) { /* fall through */ }
  }

  const host = (req.headers.host || '').split(':')[0];
  const isLocalRequest = host === 'localhost' || host === '127.0.0.1';
  const isProd = process.env.VERCEL_ENV === 'production';
  if (!verifiedEmail && !accessToken && bodyEmail && isLocalRequest && !isProd) {
    verifiedEmail = bodyEmail;
  }

  if (!verifiedEmail) {
    return res.status(401).json({ error: 'Could not verify your session.' });
  }

  try {
    // Authorization: the caller may write these logs if they ARE the target
    // user, are the target client's attached coach, or are the super admin.
    // A token/email proves identity, not which user_id it may write to — the
    // coach's Live Log calls this endpoint to save a session ON BEHALF OF a
    // client while logged in as the COACH, so an owner-only check would 403
    // every one of those. (Confirmed 2026-08-11: a coach logged a client's
    // session and no row existed anywhere, because that 403 re-threw as the
    // original error behind a toast that was easy to miss.)
    //
    // This used to take up to four sequential round trips for a non-admin
    // coach: verify token -> look up the TARGET's email -> look up the
    // client row -> look up the COACH's email, then finally insert.
    // Resolving the CALLER's id once instead lets both comparisons be plain
    // id equality, dropping two lookups entirely; the client row is already
    // in flight from above, and it no longer needs to wait for the owner
    // check to fail before starting. So the chain is now (token verify ||
    // client row) -> caller id -> insert, with the two DB reads parallel
    // instead of chained three deep. superAdmin still short-circuits on the
    // email string alone, same as before, with zero lookups.
    //
    // ilike (not eq) for the email match: case-insensitive exact match, no
    // wildcards — same comparison the old code did by lower-casing both
    // sides, just pushed into the query instead of done in JS.
    const callerRowsPromise = fetch(
      `${supabaseUrl}/rest/v1/users?email=ilike.${encodeURIComponent(verifiedEmail)}&select=id`,
      { headers: svcHeaders }
    ).then(r => r.json()).catch(() => []);

    const [callerRows, clientRows] = await Promise.all([callerRowsPromise, clientRowPromise]);
    const callerId = (Array.isArray(callerRows) && callerRows[0]?.id) || null;
    const coachId = (Array.isArray(clientRows) && clientRows[0]?.coach_id) || null;

    const isSuperAdmin = verifiedEmail === 'subodhmankala@gmail.com';
    const isOwnLogs = !!callerId && callerId === targetUserId;
    const isClientsOwnCoach = !!callerId && !!coachId && coachId === callerId;

    if (!isOwnLogs && !isSuperAdmin && !isClientsOwnCoach) {
      return res.status(403).json({ error: 'You are not authorized to write this workout for this account.' });
    }

    // return=minimal: the inserted rows were never used beyond counting them,
    // and echoing every set back costs payload and time on exactly the slow
    // connections this endpoint exists to rescue. (Safe here specifically
    // because this runs with the service role — the anon-key path still needs
    // representation, see restInsert.)
    //
    // Same one-column-at-a-time degrade as the client's own restInsert path
    // in databaseService.js (see its 2026-08-18 writeup) — this is the LAST
    // chance to persist a session, so a genuinely-missing optional column
    // (e.g. avg_heart_rate_bpm before its migration was run) must not lose
    // duration_seconds/calories_burned/etc. that DO exist just because they
    // happened to be insertable via the client but this fallback never got
    // the same fix. Bounded the same way: one retry per optional column.
    let recordsToInsert = records;
    let insertResp, errBody;
    for (let attempt = 0; attempt < 7; attempt++) {
      insertResp = await fetch(`${supabaseUrl}/rest/v1/workout_logs`, {
        method: 'POST',
        headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(recordsToInsert)
      });
      if (insertResp.ok) { errBody = null; break; }
      errBody = await insertResp.json().catch(() => null);
      const missingCol = errBody && (errBody.code === '42703' || errBody.code === 'PGRST204')
        ? errBody.message?.match(/'([a-z_]+)' column/)?.[1]
        : null;
      if (!missingCol) break;
      console.warn(`save-workout-session: workout_logs missing column '${missingCol}' — retrying without just that field.`);
      recordsToInsert = recordsToInsert.map(({ [missingCol]: _drop, ...rest }) => rest);
    }
    if (!insertResp.ok) {
      console.error('save-workout-session insert failed:', insertResp.status, errBody);
      return res.status(502).json({ error: (errBody && (errBody.message || errBody.error)) || 'Failed to save workout.' });
    }
    return res.status(200).json({ success: true, count: recordsToInsert.length });
  } catch (err) {
    console.error('save-workout-session error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save workout.' });
  }
}
