// Authoritative, RLS-proof workout_plans read. Same pattern, same reason, as
// get-workout-logs.js: a direct client-side restSelect() can come back with
// zero rows either because there are genuinely none, or because the caller's
// session token wasn't ready/valid when the read fired, and those two cases
// are indistinguishable from an empty array alone. Used as a fallback by
// databaseService.getWorkoutPlansForUser() whenever the direct read returns
// empty. Confirmed 2026-08-11: a real client (Aparna Krishna) had 6 real
// coach-created plans in the DB, and her coach's "Assigned Workout Plans"
// panel still showed "No Plans Assigned" — same RLS-empty-read gap, on the
// one table in this family of bugs that had never been touched yet.

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

  const { userId } = req.body || {};
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId || '');
  if (!isUuid) return res.status(400).json({ error: 'userId must be a UUID' });

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
    // userId must actually belong to verifiedEmail (reading your own plans),
    // OR verifiedEmail must be the coach this client is attached to, OR the
    // super admin — same three-way check as get-workout-logs.js, since this
    // is read from both the client's own "My Templates" screen and the
    // coach's "Assigned Workout Plans" panel for a specific client.
    const ownerResp = await fetch(
      `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=email`,
      { headers: svcHeaders }
    );
    const ownerRows = await ownerResp.json().catch(() => []);
    const ownerEmail = (Array.isArray(ownerRows) && ownerRows[0]?.email || '').trim().toLowerCase();
    const isOwnPlans = !!ownerEmail && ownerEmail === verifiedEmail;
    const isSuperAdmin = verifiedEmail === 'subodhmankala@gmail.com';

    let isClientsOwnCoach = false;
    if (!isOwnPlans && !isSuperAdmin) {
      const clientRows = await fetch(
        `${supabaseUrl}/rest/v1/clients?user_id=eq.${encodeURIComponent(userId)}&select=coach_id`,
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

    if (!isOwnPlans && !isSuperAdmin && !isClientsOwnCoach) {
      return res.status(403).json({ error: 'You are not authorized to read this data.' });
    }

    const resp = await fetch(
      `${supabaseUrl}/rest/v1/workout_plans?select=*&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
      { headers: svcHeaders }
    );
    const data = await resp.json().catch(() => []);
    if (!resp.ok) {
      console.error('get-workout-plans failed:', resp.status, data);
      return res.status(502).json({ error: 'Failed to read workout plans.' });
    }
    return res.status(200).json({ plans: Array.isArray(data) ? data : [] });
  } catch (err) {
    console.error('get-workout-plans error:', err);
    return res.status(500).json({ error: err.message || 'Failed to read workout plans.' });
  }
}
