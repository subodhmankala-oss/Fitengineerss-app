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

  const svcHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  try {
    // Confirm targetUserId actually belongs to verifiedEmail — a token/email
    // proves identity, not which user_id the caller is allowed to write to.
    // Also allow the target client's own attached coach, or the super admin
    // — the coach's Live Log tab calls this exact function to save a session
    // ON BEHALF OF a client (TrainerDashboard.jsx's handleFinishLiveLog),
    // logged in as the COACH, so an owner-only check rejected every one of
    // those saves with 403 whenever the direct client-side insert had
    // already failed once. That 403 then re-threw as the original error, so
    // it likely surfaced as the "Failed to save session" toast — but with no
    // trace left anywhere (no draft, no log row), a coach who didn't notice
    // that toast would see nothing at all. Confirmed 2026-08-11: a coach
    // reported logging a client's session with zero record of it existing
    // anywhere in the DB.
    const ownerResp = await fetch(
      `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(targetUserId)}&select=email`,
      { headers: svcHeaders }
    );
    const ownerRows = await ownerResp.json().catch(() => []);
    const ownerEmail = (Array.isArray(ownerRows) && ownerRows[0]?.email || '').trim().toLowerCase();
    const isOwnLogs = !!ownerEmail && ownerEmail === verifiedEmail;
    const isSuperAdmin = verifiedEmail === 'subodhmankala@gmail.com';

    let isClientsOwnCoach = false;
    if (!isOwnLogs && !isSuperAdmin) {
      const clientRows = await fetch(
        `${supabaseUrl}/rest/v1/clients?user_id=eq.${encodeURIComponent(targetUserId)}&select=coach_id`,
        { headers: svcHeaders }
      ).then(r => r.json()).catch(() => []);
      const coachId = Array.isArray(clientRows) && clientRows[0]?.coach_id;
      if (coachId) {
        const coachUserRows = await fetch(
          `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(coachId)}&select=email`,
          { headers: svcHeaders }
        ).then(r => r.json()).catch(() => []);
        const coachEmail = (Array.isArray(coachUserRows) && coachUserRows[0]?.email || '').trim().toLowerCase();
        isClientsOwnCoach = !!coachEmail && coachEmail === verifiedEmail;
      }
    }

    if (!isOwnLogs && !isSuperAdmin && !isClientsOwnCoach) {
      return res.status(403).json({ error: 'You are not authorized to write this workout for this account.' });
    }

    const insertResp = await fetch(`${supabaseUrl}/rest/v1/workout_logs`, {
      method: 'POST',
      headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(records)
    });
    const data = await insertResp.json().catch(() => null);
    if (!insertResp.ok) {
      console.error('save-workout-session insert failed:', insertResp.status, data);
      return res.status(502).json({ error: (data && (data.message || data.error)) || 'Failed to save workout.' });
    }
    return res.status(200).json({ success: true, count: Array.isArray(data) ? data.length : records.length });
  } catch (err) {
    console.error('save-workout-session error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save workout.' });
  }
}
