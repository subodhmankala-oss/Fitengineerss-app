// Consolidated authoritative, RLS-proof reads — merged from four formerly
// separate functions (get-coach-clients.js, get-workout-logs.js,
// get-workout-plans.js, lookup-profile.js) purely to stay under the Vercel
// Hobby plan's 12-Serverless-Functions-per-deployment cap (2026-08-11: the
// project had grown to 17 api/*.js files and every deploy was failing with
// "No more than 12 Serverless Functions can be added to a Deployment on the
// Hobby plan"). Each original file's handler logic is preserved verbatim
// below as its own function; this file only adds the `resource` dispatch.
//
// The public URLs (/api/get-coach-clients, /api/get-workout-logs,
// /api/get-workout-plans, /api/lookup-profile) are unchanged — vercel.json
// rewrites each old path to /api/data-read?resource=<name>, so no frontend
// code had to change.

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const svcHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

// Shared by all four: resolve the caller's verified email from their bearer
// token (never trust an email in the request body when a token is present),
// with the same narrowly-gated localhost/dev fallback each original file had.
async function resolveVerifiedEmail(req) {
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
  return verifiedEmail;
}

// ─── get-coach-clients.js ───
async function handleCoachClients(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }

  const { coachId } = req.body || {};
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(coachId || '');
  if (!isUuid) return res.status(400).json({ error: 'coachId must be a UUID' });

  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) {
    return res.status(401).json({ error: 'Could not verify your session.' });
  }

  try {
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

// ─── get-workout-logs.js ───
async function handleWorkoutLogs(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }

  const { userId } = req.body || {};
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId || '');
  if (!isUuid) return res.status(400).json({ error: 'userId must be a UUID' });

  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) {
    return res.status(401).json({ error: 'Could not verify your session.' });
  }

  try {
    const ownerResp = await fetch(
      `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=email`,
      { headers: svcHeaders }
    );
    const ownerRows = await ownerResp.json().catch(() => []);
    const ownerEmail = (Array.isArray(ownerRows) && ownerRows[0]?.email || '').trim().toLowerCase();
    const isOwnLogs = !!ownerEmail && ownerEmail === verifiedEmail;
    const isSuperAdmin = verifiedEmail === 'subodhmankala@gmail.com';

    let isClientsOwnCoach = false;
    if (!isOwnLogs && !isSuperAdmin) {
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

    if (!isOwnLogs && !isSuperAdmin && !isClientsOwnCoach) {
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

// ─── get-workout-plans.js ───
async function handleWorkoutPlans(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }

  const { userId } = req.body || {};
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId || '');
  if (!isUuid) return res.status(400).json({ error: 'userId must be a UUID' });

  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) {
    return res.status(401).json({ error: 'Could not verify your session.' });
  }

  try {
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

// ─── lookup-profile.js ───
async function handleLookupProfile(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }

  const email = await resolveVerifiedEmail(req);
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
      return res.status(200).json({ found: false, user: null, coach: null, client: null });
    }

    const [coachRows, clientRows] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/coaches?user_id=eq.${encodeURIComponent(user.id)}&select=*`, { headers: svcHeaders })
        .then(r => r.json()).catch(() => []),
      fetch(`${supabaseUrl}/rest/v1/clients?user_id=eq.${encodeURIComponent(user.id)}&select=*`, { headers: svcHeaders })
        .then(r => r.json()).catch(() => [])
    ]);

    const client = Array.isArray(clientRows) && clientRows[0] ? clientRows[0] : null;

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

// ─── get-workout-draft (workout_drafts read) ───
// Same RLS-drift story as the write side (see api/save-workout-draft.js):
// workout_drafts_select in the repo's sql/lock_down_reads.sql reads
// `user_id = current_app_user_id() OR coach_id = current_app_user_id()`,
// but the client's own restSelect() (anon key + caller's bearer token) can
// end up seeing zero rows for the exact same reasons workout_logs/
// workout_plans reads already needed this service-role-backed fallback —
// a stale/expired bearer never surfaces as an error (RLS silently returns
// []), so the Home tab's "resume workout" banner looked like there was
// simply no draft, even once one existed in the DB. Confirmed 2026-08-24.
async function handleWorkoutDraft(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }

  const { userId } = req.body || {};
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId || '');
  if (!isUuid) return res.status(400).json({ error: 'userId must be a UUID' });

  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) {
    return res.status(401).json({ error: 'Could not verify your session.' });
  }

  try {
    const ownerResp = await fetch(
      `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=email`,
      { headers: svcHeaders }
    );
    const ownerRows = await ownerResp.json().catch(() => []);
    const ownerEmail = (Array.isArray(ownerRows) && ownerRows[0]?.email || '').trim().toLowerCase();
    const isOwnDraft = !!ownerEmail && ownerEmail === verifiedEmail;
    const isSuperAdmin = verifiedEmail === 'subodhmankala@gmail.com';

    let isClientsOwnCoach = false;
    if (!isOwnDraft && !isSuperAdmin) {
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

    if (!isOwnDraft && !isSuperAdmin && !isClientsOwnCoach) {
      return res.status(403).json({ error: 'You are not authorized to read this data.' });
    }

    const resp = await fetch(
      `${supabaseUrl}/rest/v1/workout_drafts?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      { headers: svcHeaders }
    );
    const data = await resp.json().catch(() => []);
    if (!resp.ok) {
      console.error('get-workout-draft failed:', resp.status, data);
      return res.status(502).json({ error: 'Failed to read workout draft.' });
    }
    return res.status(200).json({ draft: (Array.isArray(data) && data[0]) || null });
  } catch (err) {
    console.error('get-workout-draft error:', err);
    return res.status(500).json({ error: err.message || 'Failed to read workout draft.' });
  }
}

// ─── custom-exercises (list + create) ───
// custom_exercises' own RLS (sql/supabase_custom_exercises.sql) gates on
// current_app_user_id() — auth.uid()-derived — same as workout_plans_select.
// But this app's login does NOT reliably establish a real Supabase Auth
// session for every account (many still run on the anon key with no
// auth.uid() at all — the same "RLS-vs-anon-key gap" every *ViaServer
// fallback in databaseService.js exists to work around, e.g.
// getWorkoutPlansForUser's fallback to /api/data-read?resource=workout-plans
// when a direct restSelect/restInsert comes back empty/denied). Confirmed
// 2026-08-27: a real client account with a linked auth_id still had no
// sb-*-auth-token in localStorage, so its restInsert into custom_exercises
// 42501'd outright. This service-role pair is that same safety net for
// custom_exercises: verify the caller's identity by email (resolveVerifiedEmail,
// same trust model as handleWorkoutPlans/handleWorkoutDraft above), then
// read/write with the service role, which bypasses RLS entirely.
async function resolveOwnUserRow(verifiedEmail) {
  const rows = await fetch(
    `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(verifiedEmail)}&select=id,email`,
    { headers: svcHeaders }
  ).then(r => r.json()).catch(() => []);
  return (Array.isArray(rows) && rows[0]) || null;
}

async function handleCustomExercisesList(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }
  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });

  try {
    const self = await resolveOwnUserRow(verifiedEmail);
    if (!self) return res.status(200).json({ exercises: [] });

    const isSuperAdmin = verifiedEmail === 'subodhmankala@gmail.com';
    const filter = isSuperAdmin
      ? ''
      : `&or=(created_by_user_id.eq.${self.id},coach_id.eq.${self.id},client_user_id.eq.${self.id})`;
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/custom_exercises?select=*&order=name.asc${filter}`,
      { headers: svcHeaders }
    );
    const data = await resp.json().catch(() => []);
    if (!resp.ok) {
      console.error('custom-exercises-list failed:', resp.status, data);
      return res.status(502).json({ error: 'Failed to read custom exercises.' });
    }
    return res.status(200).json({ exercises: Array.isArray(data) ? data : [] });
  } catch (err) {
    console.error('custom-exercises-list error:', err);
    return res.status(500).json({ error: err.message || 'Failed to read custom exercises.' });
  }
}

async function handleCreateCustomExercise(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }
  const { name, equipment, category, primaryMuscle, secondaryMuscles, mode, coachId, clientUserId } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required.' });
  if (mode !== 'coach' && mode !== 'client') return res.status(400).json({ error: 'mode must be "coach" or "client".' });

  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });

  try {
    const self = await resolveOwnUserRow(verifiedEmail);
    if (!self) return res.status(403).json({ error: 'No matching account for your session.' });

    const record = {
      name: name.trim(),
      equipment: equipment || null,
      category: category || null,
      primary_muscle: primaryMuscle || null,
      secondary_muscles: Array.isArray(secondaryMuscles) && secondaryMuscles.length > 0 ? secondaryMuscles : null
    };

    if (mode === 'client') {
      // A client may only create one scoped to themselves.
      if (self.id !== clientUserId) return res.status(403).json({ error: 'You can only create exercises for your own library.' });
      record.created_by_user_id = self.id;
      record.coach_id = null;
      record.client_user_id = self.id;
    } else {
      // A coach may only create one scoped to a client they actually coach.
      if (self.id !== coachId) return res.status(403).json({ error: 'You can only create exercises as yourself.' });
      const clientRows = await fetch(
        `${supabaseUrl}/rest/v1/clients?user_id=eq.${encodeURIComponent(clientUserId || '')}&select=coach_id`,
        { headers: svcHeaders }
      ).then(r => r.json()).catch(() => []);
      const isMyClient = Array.isArray(clientRows) && clientRows[0]?.coach_id === self.id;
      if (!isMyClient) return res.status(403).json({ error: 'That client is not assigned to you.' });
      record.created_by_user_id = self.id;
      record.coach_id = self.id;
      record.client_user_id = clientUserId;
    }

    const resp = await fetch(`${supabaseUrl}/rest/v1/custom_exercises`, {
      method: 'POST',
      headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(record)
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('create-custom-exercise failed:', resp.status, data);
      return res.status(502).json({ error: 'Failed to save this exercise.' });
    }
    return res.status(200).json({ exercise: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    console.error('create-custom-exercise error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save this exercise.' });
  }
}

const RESOURCE_HANDLERS = {
  'coach-clients': handleCoachClients,
  'workout-logs': handleWorkoutLogs,
  'workout-plans': handleWorkoutPlans,
  'profile': handleLookupProfile,
  'workout-draft': handleWorkoutDraft,
  'custom-exercises-list': handleCustomExercisesList,
  'custom-exercises-create': handleCreateCustomExercise
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const resource = req.query?.resource;
  const target = RESOURCE_HANDLERS[resource];
  if (!target) {
    return res.status(400).json({ error: `Unknown or missing resource: ${resource}` });
  }
  return target(req, res);
}
