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

import { buildOwnerGymPayload, buildMemberPayload, TREND_WEEKS } from './_ownerInsights.js';

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
    } catch { /* fall through */ }
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
      rows = await readRoster('*,users!clients_user_id_fkey(email,avatar_url,last_login)');
    } catch (firstErr) {
      console.error('get-coach-clients read failed, retrying without last_login:', firstErr.status, firstErr.detail);
      try {
        rows = await readRoster('*,users!clients_user_id_fkey(email,avatar_url)');
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

    // Paged: PostgREST caps each response at 1000 rows with no error, and a
    // truncated history made the client's resync re-upload every older date
    // (see src/utils/workoutLogDedupe.js). id.asc keeps pages from overlapping.
    const PAGE = 1000;
    const logs = [];
    for (let offset = 0; ; offset += PAGE) {
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/workout_logs?select=*&user_id=eq.${encodeURIComponent(userId)}` +
        `&order=log_date.desc,exercise_name.asc,set_number.asc,id.asc&limit=${PAGE}&offset=${offset}`,
        { headers: svcHeaders }
      );
      const data = await resp.json().catch(() => []);
      if (!resp.ok) {
        console.error('get-workout-logs failed:', resp.status, data);
        return res.status(502).json({ error: 'Failed to read workout history.' });
      }
      if (!Array.isArray(data)) break;
      logs.push(...data);
      if (data.length < PAGE) break;
    }
    return res.status(200).json({ logs });
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
    // users.avatar_url was missing from the schema entirely until the
    // add_avatar_url_to_users migration (updateUserAvatarUrl had been writing
    // to a non-existent column and swallowing the failure). It exists now, so
    // the embedded coach select below can ask for it — the top-level `*`
    // already carries it for the user's own row. Still worth knowing that
    // naming a column that doesn't exist 400s the whole embedded query dead
    // rather than coming back null the way a plain select would.
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}` +
      `&select=*,coaches!coaches_user_id_fkey(*),clients!clients_user_id_fkey(*,coach:users!clients_coach_id_fkey(full_name,avatar_url,coaches!coaches_user_id_fkey(brand_name,specialization,certifications,experience_years,location_city,social_media_handle)))`,
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
        avatarUrl: connectedCoach.avatar_url || null,
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

    // A client can have two open drafts — their own session ('self') and
    // their coach's Live Log ('coach'); see sql/supabase_workout_drafts_per_source.sql.
    // The client (and super admin) get both; their coach only gets the
    // Live Log row, same as the table's RLS gives a coach directly.
    const sourceFilter = (isOwnDraft || isSuperAdmin) ? '' : '&source=eq.coach';
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/workout_drafts?select=*&user_id=eq.${encodeURIComponent(userId)}${sourceFilter}`,
      { headers: svcHeaders }
    );
    const data = await resp.json().catch(() => []);
    if (!resp.ok) {
      console.error('get-workout-draft failed:', resp.status, data);
      return res.status(502).json({ error: 'Failed to read workout draft.' });
    }
    const drafts = Array.isArray(data) ? data : [];
    // `draft` is kept for app versions from before per-source drafts, which
    // only read a single row — the client's own session wins, as that's the
    // one they can act on.
    const draft = drafts.find(d => d.source === 'self') || drafts[0] || null;
    return res.status(200).json({ drafts, draft });
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
      // A coach may only create from within a client's profile they
      // actually coach (UI precondition) — but the row itself goes into the
      // coach's own library, not scoped to that one client, so it shows up
      // for every client they work with from then on. client_user_id is
      // deliberately left null; see sql/supabase_custom_exercises.sql.
      if (self.id !== coachId) return res.status(403).json({ error: 'You can only create exercises as yourself.' });
      const clientRows = await fetch(
        `${supabaseUrl}/rest/v1/clients?user_id=eq.${encodeURIComponent(clientUserId || '')}&select=coach_id`,
        { headers: svcHeaders }
      ).then(r => r.json()).catch(() => []);
      const isMyClient = Array.isArray(clientRows) && clientRows[0]?.coach_id === self.id;
      if (!isMyClient) return res.status(403).json({ error: 'That client is not assigned to you.' });
      record.created_by_user_id = self.id;
      record.coach_id = self.id;
      record.client_user_id = null;
    }

    const resp = await fetch(`${supabaseUrl}/rest/v1/custom_exercises`, {
      method: 'POST',
      headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(record)
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      // A name the owner's library already has hits
      // custom_exercises_owner_name_uniq (Postgres 23505) — not a real
      // failure, just reuse the existing row instead of erroring (the
      // "Interval running" duplication bug).
      if (data && data.code === '23505') {
        const ownerField = mode === 'coach' ? 'coach_id' : 'client_user_id';
        const ownerId = mode === 'coach' ? record.coach_id : record.client_user_id;
        const existingResp = await fetch(
          `${supabaseUrl}/rest/v1/custom_exercises?select=*&${ownerField}=eq.${encodeURIComponent(ownerId)}&name=ilike.${encodeURIComponent(record.name)}&limit=1`,
          { headers: svcHeaders }
        );
        const existing = await existingResp.json().catch(() => null);
        if (Array.isArray(existing) && existing.length > 0) {
          return res.status(200).json({ exercise: existing[0] });
        }
      }
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
      clients = await svcSelect('clients?select=*,users!clients_user_id_fkey(email,avatar_url,last_login,role)', 'admin-clients');
    } catch (e) {
      console.error('admin-clients retrying without last_login:', e.detail);
      clients = await svcSelect('clients?select=*,users!clients_user_id_fkey(email,avatar_url,role)', 'admin-clients');
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

// Super-admin Gyms tab (sql/gym_tier.sql). gyms is RLS-locked with no
// policies, so this service-role read is the only way to list it. Member
// counts come from users.gym_id (no approval step, so every member counts).
async function handleAdminGyms(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }
  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });
  if (!isSuperAdminEmail(verifiedEmail)) {
    return res.status(403).json({ error: 'Super-admin only.' });
  }

  try {
    const gyms = await svcSelect(
      'gyms?select=id,name,join_code,status,owner_sees_private,created_at,owner:users!gyms_owner_id_fkey(id,email,full_name)&order=created_at.desc',
      'admin-gyms'
    );
    const members = await svcSelect('users?select=gym_id,role&gym_id=not.is.null', 'admin-gyms members');
    const counts = {};
    for (const m of members) {
      const c = counts[m.gym_id] || (counts[m.gym_id] = { coaches: 0, clients: 0 });
      if (m.role === 'client') c.clients += 1;
      else c.coaches += 1;
    }
    return res.status(200).json({
      gyms: gyms.map((g) => ({ ...g, ...(counts[g.id] || { coaches: 0, clients: 0 }) }))
    });
  } catch (err) {
    console.error('admin-gyms error:', err, err.detail);
    return res.status(502).json({ error: 'Failed to read gyms.' });
  }
}

// Gym owner's "🏢 My Gym" view. Ownership is gyms.owner_id (the owner is a
// coach account), resolved from the VERIFIED caller — never a gym id from the
// request. Returns { gym: null } for a non-owner so the dashboard can simply
// hide the switch. Activity only (workout days, last login): private coach
// notes and progress photos are deliberately not read here
// (gyms.owner_sees_private, default off — 2026-10-14 decision).
// 8 weeks: the trend chart, "slipping" (last 2 weeks vs the 4 before) and the
// busiest-times grid all read from this one window.
const OWNER_ACTIVITY_DAYS = TREND_WEEKS * 7;

// workout_logs is one row per set, so a month of a busy gym can exceed the
// 1000-row max-rows cap — page with limit/offset like handleWorkoutLogs.
async function svcSelectAll(pathWithoutPaging, label) {
  const PAGE = 1000;
  const rows = [];
  for (let offset = 0; offset < 50 * PAGE; offset += PAGE) {
    const page = await svcSelect(`${pathWithoutPaging}&limit=${PAGE}&offset=${offset}`, label);
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

const ownerGymPayload = buildOwnerGymPayload;

async function handleOwnerGym(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }
  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });

  try {
    // ilike for case-insensitivity, with _ and % escaped — unescaped, an `_`
    // in the email is a single-character wildcard and could resolve to
    // someone else's row.
    const me = await svcSelect(`users?email=ilike.${encodeURIComponent(verifiedEmail.replace(/[\\%_]/g, '\\$&'))}&select=id&limit=1`, 'owner-gym caller');
    if (!me[0]) return res.status(200).json({ gym: null });
    const gyms = await svcSelect(
      `gyms?owner_id=eq.${me[0].id}&select=id,name,join_code,status,owner_id,created_at&order=created_at.asc&limit=1`,
      'owner-gym gym'
    );
    const gym = gyms[0];
    if (!gym) return res.status(200).json({ gym: null });

    const members = await svcSelect(
      `users?gym_id=eq.${gym.id}&select=id,full_name,email,phone,role,coach_id,created_at,last_login,avatar_url,gym_self_guided`,
      'owner-gym members'
    );
    const clientIds = members.filter((m) => m.role === 'client').map((m) => m.id);
    const since = new Date(Date.now() - OWNER_ACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const logs = clientIds.length
      ? await svcSelectAll(
          `workout_logs?select=user_id,log_date,created_at&user_id=in.(${clientIds.join(',')})&log_date=gte.${since}&order=id.asc`,
          'owner-gym workout logs'
        )
      : [];

    return res.status(200).json(ownerGymPayload(gym, members, logs));
  } catch (err) {
    console.error('owner-gym error:', err, err.detail);
    return res.status(502).json({ error: 'Failed to read your gym.' });
  }
}

// One member's profile for their gym's owner (activity + coaching history
// only). The caller must own the gym the member is in — checked here from the
// VERIFIED email, never from anything in the request body.
const MEMBER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleOwnerMember(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }
  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });
  const clientId = String((req.body || {}).clientId || '');
  if (!MEMBER_UUID.test(clientId)) return res.status(400).json({ error: 'clientId is required.' });

  try {
    const me = await svcSelect(`users?email=ilike.${encodeURIComponent(verifiedEmail.replace(/[\\%_]/g, '\\$&'))}&select=id&limit=1`, 'owner-member caller');
    if (!me[0]) return res.status(403).json({ error: 'That member isn’t in your gym.' });
    const gyms = await svcSelect(`gyms?owner_id=eq.${me[0].id}&select=id&order=created_at.asc&limit=1`, 'owner-member gym');
    if (!gyms[0]) return res.status(403).json({ error: 'That member isn’t in your gym.' });

    const users = await svcSelect(
      `users?id=eq.${clientId}&gym_id=eq.${gyms[0].id}&role=eq.client&select=id,full_name,email,phone,created_at,last_login,coach_id,gym_self_guided&limit=1`,
      'owner-member user'
    );
    if (!users[0]) return res.status(403).json({ error: 'That member isn’t in your gym.' });

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [clientRows, logs, history] = await Promise.all([
      svcSelect(`clients?user_id=eq.${clientId}&select=fitness_goal,program,program_started_on,total_sessions&limit=1`, 'owner-member client'),
      svcSelectAll(`workout_logs?select=log_date,plan_name,exercise_name,reps,weight_kg,session_id&user_id=eq.${clientId}&log_date=gte.${since}&order=id.asc`, 'owner-member logs'),
      svcSelect(`coach_assignments?client_id=eq.${clientId}&select=coach_id,source,started_at,ended_at&order=started_at.desc&limit=20`, 'owner-member history')
    ]);

    const coachIds = [...new Set([users[0].coach_id, ...history.map((h) => h.coach_id)].filter(Boolean))];
    const nameRows = coachIds.length
      ? await svcSelect(`users?id=in.(${coachIds.join(',')})&select=id,full_name,email`, 'owner-member names')
      : [];
    const names = Object.fromEntries(nameRows.map((u) => [u.id, u.full_name || (u.email || '').split('@')[0]]));

    return res.status(200).json(buildMemberPayload({
      user: users[0], client: clientRows[0] || null, logs, history, names, ownerId: me[0].id
    }));
  } catch (err) {
    console.error('owner-member error:', err, err.detail);
    return res.status(502).json({ error: 'Failed to read that member.' });
  }
}

// A trainer's own gym membership, for the "My Gym" row in their profile
// menu: which gym (if any), whether they own it, and how many of their
// clients are not in a gym yet (the "also add my N clients" option).
async function handleCoachGym(req, res) {
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }
  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });

  try {
    const me = await svcSelect(
      `users?email=ilike.${encodeURIComponent(verifiedEmail.replace(/[\\%_]/g, '\\$&'))}&select=id,gym_id,coach_id,gym_self_guided&limit=1`,
      'coach-gym caller'
    );
    if (!me[0]) return res.status(200).json({ gym: null, clientsOutsideGym: 0 });
    const outside = await svcSelect(
      `users?coach_id=eq.${me[0].id}&role=eq.client&gym_id=is.null&select=id`,
      'coach-gym clients'
    );
    let gym = null;
    if (me[0].gym_id) {
      const rows = await svcSelect(`gyms?id=eq.${me[0].gym_id}&select=name,status,owner_id,join_code`, 'coach-gym gym');
      if (rows[0]) gym = { name: rows[0].name, status: rows[0].status, code: rows[0].join_code, isOwner: rows[0].owner_id === me[0].id };
    }
    // selfGuided: a client the gym marked "trains on their own" — their
    // home screen shows the gym as a membership, not "trainer coming soon".
    const selfGuided = !!gym && !me[0].coach_id && !!me[0].gym_self_guided;
    return res.status(200).json({ gym, clientsOutsideGym: outside.length, selfGuided });
  } catch (err) {
    console.error('coach-gym error:', err, err.detail);
    return res.status(502).json({ error: 'Failed to read your gym.' });
  }
}

export const __test = { ownerGymPayload, buildMemberPayload };

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
  'platform-stats': handlePlatformStats,
  'admin-gyms': handleAdminGyms,
  'owner-gym': handleOwnerGym,
  'owner-member': handleOwnerMember,
  'coach-gym': handleCoachGym
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
