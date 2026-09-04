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
      const ownerRows = await ownerResp.json().catch(() => null);
      // A FAILED lookup is not the same as "this isn't your roster" — without
      // this check a backend/config failure came back as 403 "not authorized",
      // blaming the caller for a server problem.
      if (!ownerResp.ok || !Array.isArray(ownerRows)) {
        console.error('get-coach-clients owner lookup failed:', ownerResp.status, ownerRows);
        return res.status(502).json({ error: 'Could not verify roster ownership.' });
      }
      const ownerEmail = (ownerRows[0]?.email || '').trim().toLowerCase();
      if (!ownerEmail || ownerEmail !== verifiedEmail) {
        return res.status(403).json({ error: 'You are not authorized to read this roster.' });
      }
    }

    // Two attempts on purpose: the embedded last_login column isn't present
    // on every deployment, so a failure there falls back to the narrower
    // select. What must NOT happen is a failure of BOTH turning into an
    // empty roster — that is exactly what made every backend/config problem
    // (wrong Supabase project, unreadable service key, RLS change) surface
    // in the UI as a cheerful "No Clients Found", sending debugging after
    // missing data that was never actually missing.
    const readRoster = async (select) => {
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/clients?select=${select}&coach_id=eq.${encodeURIComponent(coachId)}`,
        { headers: svcHeaders }
      );
      const body = await resp.json().catch(() => null);
      if (!resp.ok || !Array.isArray(body)) {
        const err = new Error(`clients read failed (${resp.status})`);
        err.detail = body;
        err.status = resp.status;
        throw err;
      }
      return body;
    };

    let rows;
    try {
      rows = await readRoster('*,users!clients_user_id_fkey(email,last_login)');
    } catch (firstErr) {
      console.error('get-coach-clients read failed, retrying without last_login:', firstErr.status, firstErr.detail);
      try {
        rows = await readRoster('*,users!clients_user_id_fkey(email)');
      } catch (secondErr) {
        console.error('get-coach-clients read failed:', secondErr.status, secondErr.detail);
        return res.status(502).json({ error: 'Failed to read client roster.' });
      }
    }

    return res.status(200).json({ clients: rows });
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

  // asOne: PostgREST returns an embedded to-one relation as either a single
  // object or a single-element array depending on how it infers cardinality
  // from the FK/unique constraints — normalize both to "object or null" so
  // the parsing below doesn't have to care which one came back.
  const asOne = (v) => (Array.isArray(v) ? (v[0] || null) : (v || null));

  try {
    // Single embedded PostgREST query instead of the previous 3 sequential
    // round-trips (users → Promise.all[coaches,clients] → Promise.all[coach's
    // users,coaches]) — those were 100% dependent on each other (each needs
    // an id the last one returned), so they couldn't be parallelized, and
    // measured ~2s end-to-end even with nothing slow individually. Embedding
    // the coach chain (clients -> its coach_id's users row -> that user's
    // own coaches row) via the FK hints below gets everything in one request.
    // Confirmed 2026-08-31 this shape works: users!email -> clients (via
    // clients_user_id_fkey) -> coach:users (via clients_coach_id_fkey) ->
    // coaches (via coaches_user_id_fkey). See sql/schema for those FK names
    // if this ever needs re-verifying against a schema change.
    //
    // NOTE: users has no avatar_url column (checked directly against the
    // schema) — don't add it here, it 400s the whole embedded query dead
    // rather than just coming back null the way a normal select would.
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}` +
      `&select=*,coaches!coaches_user_id_fkey(*),clients!clients_user_id_fkey(*,coach:users!clients_coach_id_fkey(full_name,coaches!coaches_user_id_fkey(brand_name,specialization,certifications,experience_years,location_city,social_media_handle)))`,
      { headers: svcHeaders }
    );
    const rows = await resp.json().catch(() => []);
    if (!resp.ok) {
      console.error('lookup-profile embedded query failed:', resp.status, rows);
      return res.status(502).json({ error: 'Profile lookup failed.' });
    }

    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) {
      return res.status(200).json({ found: false, user: null, coach: null, client: null });
    }

    const { coaches: embeddedCoach, clients: embeddedClient, ...user } = row;
    const coach = asOne(embeddedCoach);
    const clientRow = asOne(embeddedClient);
    const client = clientRow ? (() => { const { coach: _c, ...rest } = clientRow; return rest; })() : null;

    let coachName = null;
    let coachDetails = null;
    const connectedCoach = clientRow ? asOne(clientRow.coach) : null;
    if (connectedCoach) {
      const coachBusiness = asOne(connectedCoach.coaches);
      coachName = connectedCoach.full_name || coachBusiness?.brand_name || null;
      coachDetails = {
        name: coachName,
        avatarUrl: null, // no avatar_url column on users — see note above
        brand: coachBusiness?.brand_name || null,
        specialization: coachBusiness?.specialization || null,
        certifications: coachBusiness?.certifications || null,
        experienceYears: coachBusiness?.experience_years != null ? String(coachBusiness.experience_years) : null,
        locationCity: coachBusiness?.location_city || null,
        socialHandle: coachBusiness?.social_media_handle || null,
      };
    }

    return res.status(200).json({
      found: true,
      user,
      coach,
      client,
      coachName,
      coachDetails
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
// Throws on a FAILED lookup rather than returning null, so callers can tell
// "this user has no row" (null) apart from "the query itself broke" — the
// latter used to be indistinguishable and surfaced as an empty result list.
async function resolveOwnUserRow(verifiedEmail) {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(verifiedEmail)}&select=id,email`,
    { headers: svcHeaders }
  );
  const rows = await resp.json().catch(() => null);
  if (!resp.ok || !Array.isArray(rows)) {
    const err = new Error(`user lookup failed (${resp.status})`);
    err.detail = rows;
    throw err;
  }
  return rows[0] || null;
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

// ─── admin overview (super-admin only) ───
// The Super-Admin overview counts across EVERY coach and client, which is
// precisely what RLS is designed to stop a browser-side query from doing:
// restSelect() with the anon key returns `200 []` for both `clients` and
// `coaches` — success, no rows, no error to catch. getPlatformStats() and
// getAllCoaches() therefore reported 0/0 on a platform that had 21 clients
// listed directly underneath them (the roster reads correctly because it
// already goes through this service-role file). Cross-tenant aggregates
// belong here behind an explicit super-admin check, not in the browser.
function isSuperAdminEmail(email) {
  return email === 'subodhmankala@gmail.com';
}

async function svcSelect(path, label) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: svcHeaders });
  const body = await resp.json().catch(() => null);
  if (!resp.ok || !Array.isArray(body)) {
    const err = new Error(`${label} failed (${resp.status})`);
    err.detail = body;
    throw err;
  }
  return body;
}

async function handleAdminCoaches(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }
  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });
  if (!isSuperAdminEmail(verifiedEmail)) {
    return res.status(403).json({ error: 'Super-admin only.' });
  }

  try {
    // Same last_login-might-not-be-migrated fallback getAllCoaches has had.
    const select = (withLastLogin) =>
      `coaches?select=user_id,brand_name,status,experience_years,is_blocked,created_at,users(id,email,full_name,payment_status,created_at${withLastLogin ? ',last_login' : ''})&status=eq.approved&order=created_at.asc`;
    let coaches;
    try {
      coaches = await svcSelect(select(true), 'admin-coaches');
    } catch (e) {
      console.error('admin-coaches retrying without last_login:', e.detail);
      coaches = await svcSelect(select(false), 'admin-coaches');
    }
    const clientCounts = await svcSelect('clients?select=coach_id', 'admin-coaches client counts');
    return res.status(200).json({ coaches, clientCounts });
  } catch (err) {
    console.error('admin-coaches error:', err, err.detail);
    return res.status(502).json({ error: 'Failed to read coaches.' });
  }
}

// Whole-platform client roster. getAllUsers()'s super-admin branch issues an
// UNFILTERED clients read from the browser, but RLS still scopes it to the
// caller's own rows — so the super-admin saw their own 21 clients under an
// "All Clients" heading on a platform with 47. That is not an empty result,
// so the existing zero-rows fallback there never fired. Same select shape as
// the browser-side query so the caller's mapping is unchanged.
async function handleAdminClients(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }
  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });
  if (!isSuperAdminEmail(verifiedEmail)) {
    return res.status(403).json({ error: 'Super-admin only.' });
  }

  try {
    // Same last_login-might-not-be-migrated retry as the browser-side read.
    let clients;
    try {
      clients = await svcSelect('clients?select=*,users!clients_user_id_fkey(email,last_login,role)', 'admin-clients');
    } catch (e) {
      console.error('admin-clients retrying without last_login:', e.detail);
      clients = await svcSelect('clients?select=*,users!clients_user_id_fkey(email,role)', 'admin-clients');
    }
    return res.status(200).json({ clients });
  } catch (err) {
    console.error('admin-clients error:', err, err.detail);
    return res.status(502).json({ error: 'Failed to read platform clients.' });
  }
}

async function handlePlatformStats(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }
  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });
  if (!isSuperAdminEmail(verifiedEmail)) {
    return res.status(403).json({ error: 'Super-admin only.' });
  }

  // weekStart comes from the caller so the "this week" boundary stays in the
  // viewer's timezone, exactly as the old browser-side computation did.
  const { weekStart } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart || '')) {
    return res.status(400).json({ error: 'weekStart must be YYYY-MM-DD' });
  }

  try {
    // Same stale-row filter as getAllUsers/getPlatformStats: count from
    // `clients`, ignoring rows whose owner is no longer a client, so this
    // can never disagree with the "All Clients" list built from the same table.
    const clients = await svcSelect('clients?select=id,users!clients_user_id_fkey(role)', 'platform-stats clients');
    const totalActiveClients = clients.filter((c) => !c.users?.role || c.users.role === 'client').length;

    const logs = await svcSelect(
      `workout_logs?select=log_date,user_id&log_date=gte.${encodeURIComponent(weekStart)}`,
      'platform-stats workout logs'
    );
    const totalWorkoutsLoggedThisWeek = new Set(logs.map((l) => `${l.user_id}_${l.log_date}`)).size;

    return res.status(200).json({ totalActiveClients, totalWorkoutsLoggedThisWeek });
  } catch (err) {
    console.error('platform-stats error:', err, err.detail);
    return res.status(502).json({ error: 'Failed to read platform stats.' });
  }
}

const RESOURCE_HANDLERS = {
  'coach-clients': handleCoachClients,
  'workout-logs': handleWorkoutLogs,
  'workout-plans': handleWorkoutPlans,
  'profile': handleLookupProfile,
  'workout-draft': handleWorkoutDraft,
  'custom-exercises-list': handleCustomExercisesList,
  'custom-exercises-create': handleCreateCustomExercise,
  'admin-coaches': handleAdminCoaches,
  'admin-clients': handleAdminClients,
  'platform-stats': handlePlatformStats
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
