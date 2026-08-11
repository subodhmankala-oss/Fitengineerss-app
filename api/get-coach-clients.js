// Authoritative, RLS-proof read of a coach's client roster. Same pattern and
// same root cause as lookup-profile.js / get-workout-logs.js: getClientsForCoach()
// in the browser reads `clients` via PostgREST with whatever bearer token is
// available, and that SELECT's RLS policy filters rows rather than erroring —
// so a real coach with real clients gets back 200 OK with zero rows whenever
// the token wasn't ready/valid, indistinguishable from "no clients". The
// codebase's own comment on getClientsForCoach documented this exact failure
// (dated 2026-08-09: "My Clients always showed 0") but never got a fallback —
// only the diagnosis. This endpoint is that fallback.

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

  const { coachId } = req.body || {};
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(coachId || '');
  if (!isUuid) return res.status(400).json({ error: 'coachId must be a UUID' });

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
    // Confirm coachId actually belongs to verifiedEmail — a token/email proves
    // identity, not which coach's client roster the caller may read. Super
    // admin (subodhmankala@gmail.com) is allowed to read any coach's roster,
    // matching the existing Super-Admin dashboard's access model.
    const isSuperAdmin = verifiedEmail === 'subodhmankala@gmail.com';
    if (!isSuperAdmin) {
      const ownerResp = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(coachId)}&select=email`,
        { headers: svcHeaders }
      );
      const ownerRows = await ownerResp.json().catch(() => []);
      const ownerEmail = (Array.isArray(ownerRows) && ownerRows[0]?.email || '').trim().toLowerCase();
      if (!ownerEmail || ownerEmail !== verifiedEmail) {
        return res.status(403).json({ error: 'You are not authorized to read this roster.' });
      }
    }

    let rows;
    try {
      rows = await fetch(
        `${supabaseUrl}/rest/v1/clients?select=*,users!clients_user_id_fkey(email,last_login)&coach_id=eq.${encodeURIComponent(coachId)}`,
        { headers: svcHeaders }
      ).then(r => r.json());
    } catch (e) {
      rows = null;
    }
    if (!Array.isArray(rows)) {
      // last_login column might not be migrated in on this DB yet — same
      // fallback shape as the browser-side getClientsForCoach.
      rows = await fetch(
        `${supabaseUrl}/rest/v1/clients?select=*,users!clients_user_id_fkey(email)&coach_id=eq.${encodeURIComponent(coachId)}`,
        { headers: svcHeaders }
      ).then(r => r.json()).catch(() => []);
    }

    return res.status(200).json({ clients: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    console.error('get-coach-clients error:', err);
    return res.status(500).json({ error: err.message || 'Failed to read client roster.' });
  }
}
