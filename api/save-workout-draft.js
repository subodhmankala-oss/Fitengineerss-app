// Authoritative, RLS-proof workout_drafts write, service-role-backed like
// save-workout-session.js.
//
// Why this exists: the browser writes workout_drafts via restUpsert() using
// the caller's own session token. That table's live INSERT policy turned out
// to be auth.uid()-based (not the permissive `with check (true)` the repo's
// sql/lock_down_reads.sql describes — same drift already documented for
// workout_logs in save-workout-session.js), so every draft save was rejected
// outright with 42501 ("new row violates row-level security policy"). The
// save call swallows that error (logs it, doesn't throw), so nothing in the
// UI ever surfaced it — the only visible symptom was the Home tab's "resume
// workout" banner never appearing for a client's own in-progress session,
// because the draft never actually reached the DB for it to read back.
// Confirmed 2026-08-24.
//
// This endpoint is the fallback databaseService.saveWorkoutDraft() reaches
// for whenever the direct client-side upsert fails, so the draft can still
// land even though the anon-key path is blocked.

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

  const { record, email: bodyEmailRaw } = req.body || {};
  const targetUserId = record?.user_id;
  if (!record || !targetUserId) {
    return res.status(400).json({ error: 'record.user_id is required' });
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const bodyEmail = (bodyEmailRaw || '').trim().toLowerCase();

  const svcHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  // Same shape as save-workout-session.js: kick the client-row lookup off
  // now (only needs targetUserId), in parallel with verifying the caller's
  // identity below.
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
    // Same authorization shape as save-workout-session.js: the caller may
    // write this draft if they ARE the target client, are that client's
    // attached coach (coach's Live Log editing on the client's behalf), or
    // are the super admin.
    const callerRowsPromise = fetch(
      `${supabaseUrl}/rest/v1/users?email=ilike.${encodeURIComponent(verifiedEmail)}&select=id`,
      { headers: svcHeaders }
    ).then(r => r.json()).catch(() => []);

    const [callerRows, clientRows] = await Promise.all([callerRowsPromise, clientRowPromise]);
    const callerId = (Array.isArray(callerRows) && callerRows[0]?.id) || null;
    const coachId = (Array.isArray(clientRows) && clientRows[0]?.coach_id) || null;

    const isSuperAdmin = verifiedEmail === 'subodhmankala@gmail.com';
    const isOwnDraft = !!callerId && callerId === targetUserId;
    const isClientsOwnCoach = !!callerId && !!coachId && coachId === callerId;

    if (!isOwnDraft && !isSuperAdmin && !isClientsOwnCoach) {
      return res.status(403).json({ error: 'You are not authorized to write this draft for this account.' });
    }

    const upsertResp = await fetch(`${supabaseUrl}/rest/v1/workout_drafts?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        ...svcHeaders,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(record)
    });
    if (!upsertResp.ok) {
      const errBody = await upsertResp.json().catch(() => null);
      console.error('save-workout-draft upsert failed:', upsertResp.status, errBody);
      return res.status(502).json({ error: (errBody && (errBody.message || errBody.error)) || 'Failed to save draft.' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('save-workout-draft error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save draft.' });
  }
}
