// Authoritative, RLS-proof workout_logs read, same pattern and same reason as
// lookup-profile.js and save-workout-session.js: a direct client-side
// restSelect() can come back with zero rows either because there are
// genuinely none, or because the caller's session token wasn't ready/valid
// when the read fired — and those two cases are indistinguishable from an
// empty array alone. Used as a fallback by
// databaseService.getWorkoutLogsForUser() whenever the direct read returns
// empty, so "no history" only shows when it's actually true.

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
    // userId must actually belong to verifiedEmail — a token/email proves
    // identity, not which user_id's private logs the caller may read.
    const ownerResp = await fetch(
      `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=email`,
      { headers: svcHeaders }
    );
    const ownerRows = await ownerResp.json().catch(() => []);
    const ownerEmail = (Array.isArray(ownerRows) && ownerRows[0]?.email || '').trim().toLowerCase();
    if (!ownerEmail || ownerEmail !== verifiedEmail) {
      return res.status(403).json({ error: 'You are not authorized to read this data.' });
    }

    const resp = await fetch(
      `${supabaseUrl}/rest/v1/workout_logs?select=*&user_id=eq.${encodeURIComponent(userId)}` +
      `&order=log_date.desc,exercise_name.asc,set_number.asc`,
      { headers: svcHeaders }
    );
    const data = await resp.json().catch(() => []);
    if (!resp.ok) {
      console.error('get-workout-logs failed:', resp.status, data);
      return res.status(502).json({ error: 'Failed to read workout history.' });
    }
    return res.status(200).json({ logs: Array.isArray(data) ? data : [] });
  } catch (err) {
    console.error('get-workout-logs error:', err);
    return res.status(500).json({ error: err.message || 'Failed to read workout history.' });
  }
}
