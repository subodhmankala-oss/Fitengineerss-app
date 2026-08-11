// Authoritative profile lookup, performed server-side with the service-role
// key so it can NEVER be silently emptied by row-level security.
//
// Why this exists: getUserProfileByEmail() in the browser reads public.users /
// public.clients through PostgREST using whatever bearer token is available at
// that moment. On every real login there is a window where no authenticated
// token exists yet (the profile is read before/while the session is being
// established, and signIn() deliberately bypasses the hang-prone SDK), so the
// read goes out with the anon key. RLS does not error on an unauthorized
// read — it returns ZERO ROWS, which is indistinguishable from "this account
// doesn't exist". Every caller then treats a fully-onboarded returning client
// as brand new and forces them back through the 4-step onboarding wizard,
// login after login, no matter what onboarding_completed actually says in the
// database. Confirmed repeatedly for a real account (2026-08-10).
//
// This endpoint is the escape hatch: same service-role pattern already trusted
// by complete-onboarding.js, so the answer does not depend on RLS, on the
// browser SDK's token refresh, or on which of those races happens to win.

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const svcHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const bodyEmail = ((req.body || {}).email || '').trim().toLowerCase();

  let email = null;

  if (accessToken && accessToken !== anonKey) {
    // Preferred path: the token itself proves who this is. Never trust the
    // email in the body when a token is present — resolve it from the token so
    // this can't be used to read someone else's profile.
    try {
      const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` }
      });
      if (userResp.ok) {
        const authUser = await userResp.json().catch(() => null);
        email = (authUser?.email || '').trim().toLowerCase() || null;
      }
    } catch (e) {
      // Fall through to the dev-only path / 401 below.
    }
  }

  // Dev-only fallback: the localhost Google account picker is a mock that never
  // establishes a real Supabase session, so it has no token to offer. Gated by
  // BOTH signals so an unauthenticated caller in production always gets a 401
  // rather than an account-existence oracle keyed on an arbitrary email:
  //   - the request must be addressed to localhost (a deployed environment is
  //     routed by Host, so real traffic never arrives with this Host), and
  //   - VERCEL_ENV must not be 'production'.
  const host = (req.headers.host || '').split(':')[0];
  const isLocalRequest = host === 'localhost' || host === '127.0.0.1';
  const isProd = process.env.VERCEL_ENV === 'production';
  if (!email && !accessToken && bodyEmail && isLocalRequest && !isProd) {
    email = bodyEmail;
  }

  if (!email) {
    return res.status(401).json({ error: 'Could not verify your session.' });
  }

  try {
    const userRows = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=*`,
      { headers: svcHeaders }
    ).then(r => r.json()).catch(() => []);

    const user = Array.isArray(userRows) && userRows[0] ? userRows[0] : null;
    if (!user) {
      // Genuinely no account — this is the one case where "not found" is real
      // rather than an RLS artifact, which is exactly the distinction the
      // browser-side read could not make on its own.
      return res.status(200).json({ found: false, user: null, coach: null, client: null });
    }

    const [coachRows, clientRows] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/coaches?user_id=eq.${encodeURIComponent(user.id)}&select=*`, { headers: svcHeaders })
        .then(r => r.json()).catch(() => []),
      fetch(`${supabaseUrl}/rest/v1/clients?user_id=eq.${encodeURIComponent(user.id)}&select=*`, { headers: svcHeaders })
        .then(r => r.json()).catch(() => [])
    ]);

    const client = Array.isArray(clientRows) && clientRows[0] ? clientRows[0] : null;

    // Resolve the attached coach's display name here too. The browser's own
    // getCoachNameById() reads users/coaches directly, so it hits the same RLS
    // blanking as everything else and silently returns null — which is why the
    // header rendered the raw coach UUID instead of a name.
    let coachName = null;
    if (client?.coach_id) {
      const coachUserRows = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(client.coach_id)}&select=full_name`,
        { headers: svcHeaders }
      ).then(r => r.json()).catch(() => []);
      coachName = (Array.isArray(coachUserRows) && coachUserRows[0]?.full_name) || null;
      if (!coachName) {
        const coachBrandRows = await fetch(
          `${supabaseUrl}/rest/v1/coaches?user_id=eq.${encodeURIComponent(client.coach_id)}&select=brand_name`,
          { headers: svcHeaders }
        ).then(r => r.json()).catch(() => []);
        coachName = (Array.isArray(coachBrandRows) && coachBrandRows[0]?.brand_name) || null;
      }
    }

    return res.status(200).json({
      found: true,
      user,
      coach: Array.isArray(coachRows) && coachRows[0] ? coachRows[0] : null,
      client,
      coachName
    });
  } catch (err) {
    console.error('lookup-profile error:', err);
    return res.status(500).json({ error: err.message || 'Profile lookup failed.' });
  }
}
