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

    // _ and % escaped: unescaped, an `_` in the verified email is an ilike
    // single-character wildcard and could resolve to someone else's row —
    // and that id is what every handler below trusts as "the caller".
    const rows = await fetch(
      `${supabaseUrl}/rest/v1/users?email=ilike.${encodeURIComponent(email.replace(/[\\%_]/g, '\\$&'))}&select=id,email`,
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
    // Re-adding an exercise that was previously deleted un-hides it. Best
    // effort — the save itself already succeeded.
    await setExerciseHidden(exercise.name, false).catch(e => console.warn('admin-write unhide failed:', e.message));
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

// hidden_exercises (sql/hidden_exercises.sql) is the tombstone list for
// exercises that ship in the code-defined EXERCISE_LIBRARY. Deleting the DB
// row alone isn't enough for those — every screen merges the static list
// back in, so the exercise reappears on the next load. Names are stored
// lowercased so the match is case-insensitive, same as the merge itself.
async function setExerciseHidden(name, hidden) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const resp = hidden
    ? await fetch(`${supabaseUrl}/rest/v1/hidden_exercises?on_conflict=name`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ name: key })
      })
    : await fetch(`${supabaseUrl}/rest/v1/hidden_exercises?name=eq.${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers
      });
  if (!resp.ok) {
    const data = await resp.json().catch(() => null);
    throw new Error((data && (data.message || data.error)) || `hidden_exercises update failed (${resp.status})`);
  }
}

async function handleHideExercise(req, res) {
  const caller = await resolveVerifiedCaller(req);
  if (!caller || caller.email !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Not authorized to modify the exercise library.' });
  }
  const { name } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required.' });
  try {
    await setExerciseHidden(name, true);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('admin-write hide-exercise error:', err);
    return res.status(502).json({ error: err.message || 'Failed to hide exercise.' });
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

async function handleSetClientPaused(req, res) {
  const caller = await resolveVerifiedCaller(req);
  if (!caller) return res.status(401).json({ error: 'Could not verify your session.' });

  const { clientUserId, paused } = req.body || {};
  if (!clientUserId || typeof paused !== 'boolean') {
    return res.status(400).json({ error: 'clientUserId and a boolean paused are required.' });
  }
  try {
    const data = await callRpc('set_client_paused', {
      p_coach_id: caller.id,
      p_client_id: clientUserId,
      p_paused: paused
    });
    if (data && data.success === false) return res.status(403).json({ error: data.error || 'Update failed.' });
    return res.status(200).json(data);
  } catch (err) {
    console.error('admin-write set-client-paused error:', err);
    return res.status(502).json({ error: err.message || 'Failed to update pause status.' });
  }
}

// ─── Gyms (sql/gym_tier.sql) ───
// gyms is RLS-locked with no policies, so these service-role writes are the
// only way in. Super-admin only for now; owner-side actions come later.
//
// Ownership is gyms.owner_id, not users.role — linking an owner here does
// NOT change their role, so an owner who also coaches keeps their coach
// dashboard. Gyms are never deleted from the app (suspend instead): the
// users.gym_status CHECK would block ON DELETE SET NULL for any gym with
// members anyway.
// No pending/approval state — the admin can only suspend or reactivate.
const GYM_STATUSES = ['active', 'suspended'];
const PLAIN_EMAIL = /^[^\s@%*,]+@[^\s@%*,]+\.[^\s@%*,]+$/;

async function svcRequest(path, { method = 'GET', body } = {}) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const err = new Error((data && (data.message || data.error)) || `${method} ${path.split('?')[0]} failed (${resp.status})`);
    err.status = resp.status;
    throw err;
  }
  return data;
}

// Returns { id } for an existing account, null for "no such account", and
// throws a 400-shaped error for a malformed email. ilike (not eq) because
// stored emails aren't consistently lowercased; PLAIN_EMAIL rejects the
// wildcard characters that would otherwise make ilike a pattern match.
async function resolveOwnerByEmail(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!PLAIN_EMAIL.test(email)) {
    const err = new Error('Enter a valid owner email.');
    err.status = 400;
    throw err;
  }
  const rows = await svcRequest(`users?email=ilike.${encodeURIComponent(email.replace(/[\\_]/g, '\\$&'))}&select=id&limit=1`);
  return Array.isArray(rows) && rows[0] ? { id: rows[0].id } : null;
}

function cleanGymName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  return name.length >= 2 && name.length <= 80 ? name : null;
}

async function requireSuperAdmin(req, res) {
  const caller = await resolveVerifiedCaller(req);
  if (!caller || caller.email !== SUPER_ADMIN_EMAIL) {
    res.status(403).json({ error: 'Super-admin only.' });
    return null;
  }
  return caller;
}

async function handleCreateGym(req, res) {
  if (!(await requireSuperAdmin(req, res))) return;
  const { name, ownerEmail } = req.body || {};
  const cleanName = cleanGymName(name);
  if (!cleanName) return res.status(400).json({ error: 'Gym name must be 2–80 characters.' });

  try {
    let ownerId = null;
    if (ownerEmail && String(ownerEmail).trim()) {
      const owner = await resolveOwnerByEmail(ownerEmail);
      if (!owner) return res.status(404).json({ error: 'No account with that email. Ask the owner to sign up first.' });
      ownerId = owner.id;
    }
    // No approval step anywhere (sql/gym_tier_no_approval.sql) — active on creation.
    const rows = await svcRequest('gyms', {
      method: 'POST',
      body: { name: cleanName, owner_id: ownerId, status: 'active' }
    });
    return res.status(200).json({ gym: Array.isArray(rows) ? rows[0] : rows });
  } catch (err) {
    console.error('admin-write create-gym error:', err);
    return res.status(err.status === 400 ? 400 : 502).json({ error: err.message || 'Failed to create gym.' });
  }
}

async function handleUpdateGym(req, res) {
  if (!(await requireSuperAdmin(req, res))) return;
  const { gymId, name, status, ownerEmail } = req.body || {};
  if (!/^[0-9a-f-]{36}$/i.test(String(gymId || ''))) return res.status(400).json({ error: 'gymId is required.' });

  const patch = {};
  if (name !== undefined) {
    const cleanName = cleanGymName(name);
    if (!cleanName) return res.status(400).json({ error: 'Gym name must be 2–80 characters.' });
    patch.name = cleanName;
  }
  if (status !== undefined) {
    if (!GYM_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${GYM_STATUSES.join(', ')}.` });
    patch.status = status;
  }

  try {
    if (ownerEmail !== undefined) {
      // Empty string = remove the owner.
      if (!String(ownerEmail || '').trim()) {
        patch.owner_id = null;
      } else {
        const owner = await resolveOwnerByEmail(ownerEmail);
        if (!owner) return res.status(404).json({ error: 'No account with that email. Ask the owner to sign up first.' });
        patch.owner_id = owner.id;
      }
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

    const id = encodeURIComponent(gymId);
    const rows = await svcRequest(`gyms?id=eq.${id}`, { method: 'PATCH', body: patch });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(404).json({ error: 'Gym not found.' });
    return res.status(200).json({ gym: rows[0] });
  } catch (err) {
    console.error('admin-write update-gym error:', err);
    return res.status(err.status === 400 ? 400 : 502).json({ error: err.message || 'Failed to update gym.' });
  }
}

// Gym owner moves one of their gym's clients to another trainer in the gym.
// The owner id is the VERIFIED caller; owner_assign_client
// (sql/gym_owner_assign_client.sql) re-checks gym ownership, that the client
// and trainer are both in that gym, and that the gym is active.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleOwnerAssignClient(req, res) {
  const caller = await resolveVerifiedCaller(req);
  if (!caller) return res.status(401).json({ error: 'Could not verify your session.' });

  const { clientUserId, coachUserId } = req.body || {};
  if (!UUID_RE.test(String(clientUserId || '')) || !UUID_RE.test(String(coachUserId || ''))) {
    return res.status(400).json({ error: 'clientUserId and coachUserId are required.' });
  }
  try {
    const data = await callRpc('owner_assign_client', {
      p_owner_id: caller.id,
      p_client_id: clientUserId,
      p_coach_id: coachUserId
    });
    if (data && data.success === false) return res.status(403).json({ error: data.error || 'Could not move that client.' });
    return res.status(200).json(data);
  } catch (err) {
    console.error('admin-write owner-assign-client error:', err);
    return res.status(502).json({ error: err.message || 'Could not move that client.' });
  }
}

// Gym owner takes a client off their trainer — the client stays in the gym,
// back on the "waiting for a trainer" list (sql/gym_owner_unassign_client.sql).
async function handleOwnerUnassignClient(req, res) {
  const caller = await resolveVerifiedCaller(req);
  if (!caller) return res.status(401).json({ error: 'Could not verify your session.' });

  // selfGuided: true = "trains on their own" (no trainer wanted); false =
  // back on the waiting list (sql/gym_self_guided.sql).
  const { clientUserId, selfGuided } = req.body || {};
  if (!UUID_RE.test(String(clientUserId || ''))) {
    return res.status(400).json({ error: 'clientUserId is required.' });
  }
  try {
    const data = await callRpc('owner_unassign_client', {
      p_owner_id: caller.id,
      p_client_id: clientUserId,
      p_self_guided: selfGuided === true
    });
    if (data && data.success === false) return res.status(403).json({ error: data.error || 'Could not remove the trainer.' });
    return res.status(200).json(data);
  } catch (err) {
    console.error('admin-write owner-unassign-client error:', err);
    return res.status(502).json({ error: err.message || 'Could not remove the trainer.' });
  }
}

// Gym owner money + settings (sql/gym_business.sql). Every function takes the
// VERIFIED caller as the owner and re-checks the gym/member inside the DB.
function gymBusinessAction(fnName, label, buildParams) {
  return async (req, res) => {
    const caller = await resolveVerifiedCaller(req);
    if (!caller) return res.status(401).json({ error: 'Could not verify your session.' });
    const params = buildParams(req.body || {}, caller);
    if (!params) return res.status(400).json({ error: 'Some details are missing or wrong.' });
    try {
      const data = await callRpc(fnName, params);
      return res.status(200).json(data || { success: true });
    } catch (err) {
      console.error(`admin-write ${label} error:`, err);
      return res.status(400).json({ error: err.message || 'Could not save.' });
    }
  };
}
const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const isDate = (d) => d == null || /^\d{4}-\d{2}-\d{2}$/.test(String(d));

const handleGymStartMembership = gymBusinessAction('gym_start_membership', 'gym-start-membership', (b, c) => (
  UUID_RE.test(String(b.memberId || '')) && UUID_RE.test(String(b.planId || '')) && isInt(Number(b.paidInr), 0, 10000000) && isDate(b.paidOn)
    ? { p_owner_id: c.id, p_member_id: b.memberId, p_plan_id: b.planId, p_paid_inr: Number(b.paidInr), p_method: String(b.method || 'upi'), p_paid_on: b.paidOn || null }
    : null
));
const handleGymPayMembership = gymBusinessAction('gym_pay_membership', 'gym-pay-membership', (b, c) => (
  UUID_RE.test(String(b.membershipId || '')) && isInt(Number(b.amountInr), 1, 10000000) && isDate(b.paidOn)
    ? { p_owner_id: c.id, p_membership_id: b.membershipId, p_amount_inr: Number(b.amountInr), p_method: String(b.method || 'upi'), p_paid_on: b.paidOn || null }
    : null
));
const handleGymSavePlans = gymBusinessAction('gym_save_plans', 'gym-save-plans', (b, c) => (
  Array.isArray(b.plans) && b.plans.length <= 20 && b.plans.every((p) =>
    p && typeof p.name === 'string' && p.name.trim().length >= 1 && p.name.length <= 60
    && isInt(Number(p.months), 1, 36) && isInt(Number(p.priceInr), 0, 10000000)
    && (p.sessions == null || p.sessions === '' || isInt(Number(p.sessions), 1, 1000)))
    ? { p_owner_id: c.id, p_plans: b.plans.map((p) => ({ id: p.id || null, name: p.name.trim(), months: Number(p.months), sessions: p.sessions === '' ? null : p.sessions, priceInr: Number(p.priceInr) })) }
    : null
));
const GYM_COLOURS = ['blue', 'teal', 'green', 'orange', 'pink'];
const LEAD_SOURCES = ['instagram', 'walk-in', 'referral', 'google', 'other'];
const LEAD_STAGES = ['new', 'trial_booked', 'trial_done', 'joined'];
const isTimestamp = (t) => t == null || t === '' || !Number.isNaN(Date.parse(String(t)));
const handleGymSaveSettings = gymBusinessAction('gym_save_settings', 'gym-save-settings', (b, c) => (
  GYM_COLOURS.includes(b.color) && isInt(Number(b.joinGoal), 1, 100000) && isInt(Number(b.capacity), 1, 100000) && isInt(Number(b.sharePct), 0, 100)
    ? { p_owner_id: c.id, p_color: b.color, p_renewal: b.renewal === true, p_miss: b.miss === true, p_receipt: b.receipt === true, p_birthday: b.birthday === true, p_join_goal: Number(b.joinGoal), p_capacity: Number(b.capacity), p_share_pct: Number(b.sharePct) }
    : null
));

const handleGymLead = gymBusinessAction('gym_lead_action', 'gym-lead', (b, c) => {
  const base = { p_owner_id: c.id, p_op: b.op, p_lead_id: null, p_name: null, p_phone: null, p_source: null, p_note: null, p_stage: null, p_trial_at: isTimestamp(b.trialAt) && b.trialAt ? new Date(b.trialAt).toISOString() : null };
  if (b.op === 'add') {
    return typeof b.name === 'string' && b.name.trim().length >= 1 && b.name.length <= 80 && LEAD_SOURCES.includes(b.source || 'walk-in') && isTimestamp(b.trialAt)
      && (b.phone == null || String(b.phone).length <= 20) && (b.note == null || String(b.note).length <= 200)
      ? { ...base, p_name: b.name, p_phone: b.phone || null, p_source: b.source || 'walk-in', p_note: b.note || null }
      : null;
  }
  if (b.op === 'move') {
    return UUID_RE.test(String(b.leadId || '')) && LEAD_STAGES.includes(b.stage) && isTimestamp(b.trialAt)
      ? { ...base, p_lead_id: b.leadId, p_stage: b.stage }
      : null;
  }
  if (b.op === 'delete') return UUID_RE.test(String(b.leadId || '')) ? { ...base, p_lead_id: b.leadId } : null;
  return null;
});
const handleGymCheckin = gymBusinessAction('gym_checkin', 'gym-checkin', (b, c) => (
  UUID_RE.test(String(b.memberId || '')) ? { p_owner_id: c.id, p_member_id: b.memberId, p_out: b.out === true } : null
));
const handleGymPayout = gymBusinessAction('gym_trainer_payout', 'gym-payout', (b, c) => (
  UUID_RE.test(String(b.trainerId || '')) && /^\d{4}-\d{2}-\d{2}$/.test(String(b.month || '')) && isInt(Number(b.amountInr), 0, 100000000)
    ? { p_owner_id: c.id, p_trainer_id: b.trainerId, p_month: b.month, p_amount_inr: Number(b.amountInr), p_paid: b.paid === true }
    : null
));

// Trainer days in + member high-fives (sql/gym_trainer_days.sql). The
// trainer / member is always the VERIFIED caller.
const handleGymTrainerTouch = gymBusinessAction('gym_trainer_touch', 'gym-trainer-touch', (b, c) => ({ p_trainer_id: c.id }));
const handleGymTrainerToday = gymBusinessAction('gym_trainer_set_today', 'gym-trainer-today', (b, c) => ({ p_trainer_id: c.id, p_off: b.off === true }));
const handleGymOwnerMarkDay = gymBusinessAction('gym_owner_mark_day', 'gym-owner-mark-day', (b, c) => (
  UUID_RE.test(String(b.trainerId || '')) && /^\d{4}-\d{2}-\d{2}$/.test(String(b.day || '')) && (b.status == null || ['in', 'off'].includes(b.status))
    ? { p_owner_id: c.id, p_trainer_id: b.trainerId, p_day: b.day, p_status: b.status ?? null }
    : null
));
const handleGymHighFive = gymBusinessAction('gym_high_five', 'gym-high-five', (b, c) => ({ p_member_id: c.id }));

// A trainer joins / leaves a gym with its code (sql/gym_coach_join_leave.sql).
// The trainer is the VERIFIED caller; the database functions do every check.
async function handleCoachJoinGym(req, res) {
  const caller = await resolveVerifiedCaller(req);
  if (!caller) return res.status(401).json({ error: 'Could not verify your session.' });

  const { code, bringClients } = req.body || {};
  if (typeof code !== 'string' || !code.trim() || code.length > 20) {
    return res.status(400).json({ error: 'Enter your gym code.' });
  }
  try {
    const data = await callRpc('coach_join_gym', {
      p_coach_id: caller.id,
      p_code: code,
      p_bring_clients: bringClients === true
    });
    if (data && data.success === false) return res.status(400).json({ error: data.error || 'Could not join that gym.' });
    return res.status(200).json(data);
  } catch (err) {
    console.error('admin-write coach-join-gym error:', err);
    return res.status(502).json({ error: err.message || 'Could not join that gym.' });
  }
}

async function handleCoachLeaveGym(req, res) {
  const caller = await resolveVerifiedCaller(req);
  if (!caller) return res.status(401).json({ error: 'Could not verify your session.' });
  try {
    const data = await callRpc('coach_leave_gym', { p_coach_id: caller.id });
    if (data && data.success === false) return res.status(400).json({ error: data.error || 'Could not leave the gym.' });
    return res.status(200).json(data);
  } catch (err) {
    console.error('admin-write coach-leave-gym error:', err);
    return res.status(502).json({ error: err.message || 'Could not leave the gym.' });
  }
}

// A client joins a gym with its code and waits for the owner to assign a
// trainer (sql/gym_client_join.sql). The client is the VERIFIED caller.
async function handleClientJoinGym(req, res) {
  const caller = await resolveVerifiedCaller(req);
  if (!caller) return res.status(401).json({ error: 'Could not verify your session.' });

  const { code } = req.body || {};
  if (typeof code !== 'string' || !code.trim() || code.length > 20) {
    return res.status(400).json({ error: 'Enter your gym code.' });
  }
  try {
    const data = await callRpc('client_join_gym', { p_client_id: caller.id, p_code: code });
    if (data && data.success === false) return res.status(400).json({ error: data.error || 'Could not join that gym.' });
    return res.status(200).json(data);
  } catch (err) {
    console.error('admin-write client-join-gym error:', err);
    return res.status(502).json({ error: err.message || 'Could not join that gym.' });
  }
}

const ACTION_HANDLERS = {
  'save-exercise': handleSaveExercise,
  'delete-exercise': handleDeleteExercise,
  'hide-exercise': handleHideExercise,
  'seed-exercises': handleSeedExercises,
  'set-client-total-sessions': handleSetClientTotalSessions,
  'set-client-program-dates': handleSetClientProgramDates,
  'set-client-paused': handleSetClientPaused,
  'create-gym': handleCreateGym,
  'update-gym': handleUpdateGym,
  'owner-assign-client': handleOwnerAssignClient,
  'owner-unassign-client': handleOwnerUnassignClient,
  'gym-start-membership': handleGymStartMembership,
  'gym-pay-membership': handleGymPayMembership,
  'gym-save-plans': handleGymSavePlans,
  'gym-save-settings': handleGymSaveSettings,
  'gym-lead': handleGymLead,
  'gym-checkin': handleGymCheckin,
  'gym-payout': handleGymPayout,
  'gym-trainer-touch': handleGymTrainerTouch,
  'gym-trainer-today': handleGymTrainerToday,
  'gym-owner-mark-day': handleGymOwnerMarkDay,
  'gym-high-five': handleGymHighFive,
  'coach-join-gym': handleCoachJoinGym,
  'coach-leave-gym': handleCoachLeaveGym,
  'client-join-gym': handleClientJoinGym
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
