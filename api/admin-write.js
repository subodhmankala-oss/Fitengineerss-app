// Consolidated admin/coach-privileged write endpoint for RPCs that used to
// be callable directly via /rest/v1/rpc/<fn> with just the public anon key.
//
// Why this exists: save_exercise, delete_exercise, and admin_seed_exercises
// (sql/exercises_table.sql) decide "is this really the admin" by checking a
// plain `p_admin_email` TEXT parameter the CALLER supplies — anyone hitting
// the RPC directly (anon key, no login at all) could just type
// "subodhmankala@gmail.com" as that parameter and it would pass. Same shape
// of problem for set_client_total_sessions/set_client_program_dates
// (sql/supabase_total_sessions.sql, sql/supabase_program_dates.sql): the
// coach↔client scope check is real, but `p_coach_id` is a caller-supplied
// parameter with nothing tying it to who's actually calling — any coach_id/
// client_id pair (guessed or otherwise obtained) could be used to rewrite
// that client's session count or program dates. Confirmed exploitable
// 2026-08-30 via direct RPC call with the anon key.
//
// Fix, mirroring the resolveVerifiedEmail pattern already used throughout
// this api/ folder (see data-read.js): verify the caller's bearer token
// against Supabase Auth here, server-side, and only then call the RPC with
// the SERVICE ROLE key — passing an identity THIS SERVER verified, never
// one the client claims. The companion migration
// (sql/revoke_admin_rpc_anon_execute.sql) revokes anon/authenticated EXECUTE
// on all five functions, so this route becomes the only way to call them —
// without that revoke, someone could still bypass this endpoint entirely and
// hit the RPC directly.

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Same hardcoded identity every other admin-gated spot in this codebase uses
// (App.jsx's processSessionUser, api/push.js's notify-user handler) — kept
// in sync deliberately, not read from a role column, per those files' own
// comments.
const SUPER_ADMIN_EMAIL = 'subodhmankala@gmail.com';

// Resolves who is REALLY calling, from their bearer token — never trusts
// anything the request body claims about identity. Returns null (never
// throws) if the token is missing, invalid, or doesn't resolve to a
// public.users row.
async function resolveVerifiedCaller(req) {
  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken || accessToken === anonKey) return null;

  try {
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` }
    });
    if (!userResp.ok) return null;
    const authUser = await userResp.json().catch(() => null);
    const email = (authUser?.email || '').trim().toLowerCase();
    if (!email) return null;

    const rows = await fetch(
      `${supabaseUrl}/rest/v1/users?email=ilike.${encodeURIComponent(email)}&select=id,email`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    ).then(r => r.json()).catch(() => []);
    const row = Array.isArray(rows) && rows[0];
    return row ? { id: row.id, email } : null;
  } catch {
    return null;
  }
}

async function callRpc(fnName, params) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    },
    body: JSON.stringify(params)
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = (data && (data.message || data.error || data.hint)) || `RPC ${fnName} failed (${resp.status})`;
    throw new Error(msg);
  }
  return data;
}

async function handleSaveExercise(req, res) {
  const caller = await resolveVerifiedCaller(req);
  if (!caller || caller.email !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Not authorized to modify the exercise library.' });
  }
  const { exercise } = req.body || {};
  if (!exercise || !exercise.name) return res.status(400).json({ error: 'exercise (with a name) is required.' });
  try {
    const data = await callRpc('save_exercise', {
      p_exercise: {
        id: exercise.id || null,
        name: exercise.name,
        category: exercise.category,
        primary_muscle: exercise.primary_muscle,
        secondary_muscle: exercise.secondary_muscle || '',
        video_url: exercise.video_url || '',
        setup: exercise.setup || '',
        execution: exercise.execution || '',
        tip: exercise.tip || ''
      },
      p_admin_email: SUPER_ADMIN_EMAIL
    });
    return res.status(200).json({ exercise: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    console.error('admin-write save-exercise error:', err);
    return res.status(502).json({ error: err.message || 'Failed to save exercise.' });
  }
}

async function handleDeleteExercise(req, res) {
  const caller = await resolveVerifiedCaller(req);
  if (!caller || caller.email !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Not authorized to modify the exercise library.' });
  }
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id is required.' });
  try {
    await callRpc('delete_exercise', { p_id: id, p_admin_email: SUPER_ADMIN_EMAIL });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('admin-write delete-exercise error:', err);
    return res.status(502).json({ error: err.message || 'Failed to delete exercise.' });
  }
}

async function handleSeedExercises(req, res) {
  const caller = await resolveVerifiedCaller(req);
  if (!caller || caller.email !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Not authorized to seed the exercise library.' });
  }
  const { exercises } = req.body || {};
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return res.status(400).json({ error: 'exercises must be a non-empty array.' });
  }
  try {
    const inserted = await callRpc('admin_seed_exercises', { p_exercises: exercises, p_admin_email: SUPER_ADMIN_EMAIL });
    return res.status(200).json({ inserted });
  } catch (err) {
    console.error('admin-write seed-exercises error:', err);
    return res.status(502).json({ error: err.message || 'Failed to seed exercises.' });
  }
}

async function handleSetClientTotalSessions(req, res) {
  const caller = await resolveVerifiedCaller(req);
  if (!caller) return res.status(401).json({ error: 'Could not verify your session.' });

  const { clientUserId, totalSessions } = req.body || {};
  const parsed = parseInt(totalSessions, 10);
  if (!clientUserId || !Number.isFinite(parsed) || parsed < 1) {
    return res.status(400).json({ error: 'clientUserId and a totalSessions of 1 or more are required.' });
  }
  try {
    const data = await callRpc('set_client_total_sessions', {
      // Server-resolved from the verified caller, never trusted from the
      // request body — this is the actual fix, the RPC's own WHERE clause
      // was already correct, it just had no way to know who was really
      // calling before this endpoint existed.
      p_coach_id: caller.id,
      p_client_id: clientUserId,
      p_total: parsed
    });
    if (data && data.success === false) return res.status(403).json({ error: data.error || 'Update failed.' });
    return res.status(200).json(data);
  } catch (err) {
    console.error('admin-write set-client-total-sessions error:', err);
    return res.status(502).json({ error: err.message || 'Failed to update session count.' });
  }
}

async function handleSetClientProgramDates(req, res) {
  const caller = await resolveVerifiedCaller(req);
  if (!caller) return res.status(401).json({ error: 'Could not verify your session.' });

  const { clientUserId, startedOn, estCompletion } = req.body || {};
  if (!clientUserId) return res.status(400).json({ error: 'clientUserId is required.' });
  try {
    const data = await callRpc('set_client_program_dates', {
      p_coach_id: caller.id,
      p_client_id: clientUserId,
      p_started_on: startedOn || null,
      p_est_completion: estCompletion || null
    });
    if (data && data.success === false) return res.status(403).json({ error: data.error || 'Update failed.' });
    return res.status(200).json(data);
  } catch (err) {
    console.error('admin-write set-client-program-dates error:', err);
    return res.status(502).json({ error: err.message || 'Failed to update program dates.' });
  }
}

const ACTION_HANDLERS = {
  'save-exercise': handleSaveExercise,
  'delete-exercise': handleDeleteExercise,
  'seed-exercises': handleSeedExercises,
  'set-client-total-sessions': handleSetClientTotalSessions,
  'set-client-program-dates': handleSetClientProgramDates
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

  const action = req.query?.action;
  const target = ACTION_HANDLERS[action];
  if (!target) return res.status(400).json({ error: `Unknown or missing action: ${action}` });
  return target(req, res);
}
