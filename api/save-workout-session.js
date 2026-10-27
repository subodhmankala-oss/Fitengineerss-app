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

// "Add missed exercise": append `records` (built by the browser's
// buildWorkoutLogRecords) to the workout already saved on append.logDate.
// The target is that day's most recently saved session. Its session_id is
// reused and its session_row numbering continued, so the dedupe read and
// Home's per-session totals still treat old + new rows as ONE workout; its
// calories go up by append.addedCalories on every row (duration stays — the
// time between saving and remembering wasn't workout time). A pre-session_id
// legacy workout can't be joined that way, so its new rows get their own
// session_id and carry only the added calories, which Home sums per session.
// Exported for the unit test.
export async function appendToSavedSession({ svcHeaders, userId, records, append, fetchImpl = fetch }) {
  const logDate = String(append.logDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) return { status: 400, body: { error: 'append.logDate must be YYYY-MM-DD' } };
  const addedCalories = Math.max(0, Math.round(Number(append.addedCalories) || 0));

  const existingResp = await fetchImpl(
    `${supabaseUrl}/rest/v1/workout_logs?user_id=eq.${encodeURIComponent(userId)}&log_date=eq.${logDate}` +
    '&select=session_id,session_row,plan_name,duration_seconds,calories_burned,created_at&order=created_at.desc',
    { headers: svcHeaders }
  );
  const existing = existingResp.ok ? await existingResp.json().catch(() => []) : null;
  if (!Array.isArray(existing)) return { status: 502, body: { error: 'Couldn\'t read that day\'s workout. Try again.' } };
  if (existing.length === 0) return { status: 404, body: { error: 'No saved workout on that day to add to.' } };

  const latest = existing[0];
  const sessionId = latest.session_id || null;
  const sessionRows = sessionId
    ? existing.filter(r => r.session_id === sessionId)
    : existing.filter(r => r.created_at === latest.created_at);
  const baseCalories = sessionRows.find(r => r.calories_burned != null)?.calories_burned ?? null;
  const durationSeconds = sessionRows.find(r => r.duration_seconds != null)?.duration_seconds ?? null;
  const nextRow = sessionId ? Math.max(-1, ...sessionRows.map(r => Number(r.session_row) || 0)) + 1 : 0;
  const newTotal = sessionId
    ? (baseCalories != null || addedCalories > 0 ? Math.round(((Number(baseCalories) || 0) + addedCalories) * 10) / 10 : null)
    : (addedCalories > 0 ? addedCalories : null);
  const ownSessionId = sessionId || `missed-${Date.now()}`;

  const rows = records.map((r, i) => ({
    ...r,
    user_id: userId,
    log_date: logDate,
    plan_name: latest.plan_name || r.plan_name || 'Custom Routine',
    duration_seconds: sessionId ? durationSeconds : null,
    calories_burned: newTotal,
    avg_heart_rate_bpm: null,
    max_heart_rate_bpm: null,
    session_id: ownSessionId,
    session_row: nextRow + i
  }));

  let toSend = rows;
  let insertResp, errBody;
  for (let attempt = 0; attempt < 10; attempt++) {
    insertResp = await fetchImpl(`${supabaseUrl}/rest/v1/workout_logs`, {
      method: 'POST',
      headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(toSend)
    });
    if (insertResp.ok) { errBody = null; break; }
    errBody = await insertResp.json().catch(() => null);
    const missingCol = errBody && (errBody.code === '42703' || errBody.code === 'PGRST204')
      ? errBody.message?.match(/'([a-z_]+)' column/)?.[1]
      : null;
    if (!missingCol) break;
    toSend = toSend.map(({ [missingCol]: _drop, ...rest }) => rest);
  }
  if (!insertResp.ok) {
    console.error('save-workout-session append insert failed:', insertResp.status, errBody);
    return { status: 502, body: { error: (errBody && errBody.message) || 'Couldn\'t add the missed exercises. Try again.' } };
  }

  // Bring the original rows up to the same session total. Best effort: the
  // sets are already saved, and a failure here only leaves the old calorie
  // figure on the earlier rows.
  if (sessionId && newTotal != null) {
    const patchResp = await fetchImpl(
      `${supabaseUrl}/rest/v1/workout_logs?user_id=eq.${encodeURIComponent(userId)}&session_id=eq.${encodeURIComponent(sessionId)}`,
      {
        method: 'PATCH',
        headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ calories_burned: newTotal })
      }
    ).catch(() => null);
    if (!patchResp || !patchResp.ok) console.warn('save-workout-session append: calorie update failed for', sessionId);
  }

  return { status: 200, body: { success: true, count: rows.length, sessionId: ownSessionId, caloriesBurned: newTotal } };
}

// "Edit workout": change or delete sets of a workout already saved on
// edit.logDate. edit.updates = [{ id, reps, weight_kg, distance_km,
// cardio_duration_seconds }] (only those four columns can change — the set's
// exercise, date, type and session stay), edit.deletes = [id], and
// edit.kcalDeltas = { [id]: kcal } — the browser's estimate of how much each
// change moves the calories. Each touched session's calories move by the sum
// of its rows' deltas, on every row of that session (never below 0); its
// duration stays. Every id must be one of that user's rows on that date.
// Exported for the unit test.
const EDITABLE_COLUMNS = ['reps', 'weight_kg', 'distance_km', 'cardio_duration_seconds'];
export async function editSavedSession({ svcHeaders, userId, edit, fetchImpl = fetch }) {
  const logDate = String(edit.logDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) return { status: 400, body: { error: 'edit.logDate must be YYYY-MM-DD' } };
  const updates = Array.isArray(edit.updates) ? edit.updates : [];
  const deletes = Array.isArray(edit.deletes) ? edit.deletes.map(String) : [];
  if (updates.length === 0 && deletes.length === 0) return { status: 400, body: { error: 'Nothing to change.' } };
  const deltas = edit.kcalDeltas && typeof edit.kcalDeltas === 'object' ? edit.kcalDeltas : {};

  const dayResp = await fetchImpl(
    `${supabaseUrl}/rest/v1/workout_logs?user_id=eq.${encodeURIComponent(userId)}&log_date=eq.${logDate}` +
    '&select=id,session_id,created_at,calories_burned',
    { headers: svcHeaders }
  );
  const dayRows = dayResp.ok ? await dayResp.json().catch(() => null) : null;
  if (!Array.isArray(dayRows)) return { status: 502, body: { error: "Couldn't read that day's workout. Try again." } };
  const byId = new Map(dayRows.map(r => [String(r.id), r]));
  const touchedIds = [...updates.map(u => String(u.id)), ...deletes];
  if (touchedIds.some(id => !byId.has(id))) return { status: 404, body: { error: 'Some of those sets are no longer saved. Reload and try again.' } };
  if (deletes.length >= dayRows.length) return { status: 400, body: { error: 'Keep at least one set in the workout.' } };

  const writeHeaders = { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  const rowFilter = (id) => `${supabaseUrl}/rest/v1/workout_logs?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`;

  for (const u of updates) {
    const fields = {};
    EDITABLE_COLUMNS.forEach(c => { if (c in u) fields[c] = u[c] == null ? null : Number(u[c]) || 0; });
    if (Object.keys(fields).length === 0) continue;
    const r = await fetchImpl(rowFilter(u.id), { method: 'PATCH', headers: writeHeaders, body: JSON.stringify(fields) });
    if (!r.ok) return { status: 502, body: { error: "Couldn't save your changes. Try again." } };
  }
  if (deletes.length > 0) {
    const r = await fetchImpl(
      `${supabaseUrl}/rest/v1/workout_logs?user_id=eq.${encodeURIComponent(userId)}&id=in.(${deletes.map(encodeURIComponent).join(',')})`,
      { method: 'DELETE', headers: writeHeaders }
    );
    if (!r.ok) return { status: 502, body: { error: "Couldn't remove those sets. Try again." } };
  }

  // Calories, per touched session (session_id, or created_at for a
  // pre-session_id save — one INSERT shares one created_at).
  const sessionKey = (r) => (r.session_id ? `sid:${r.session_id}` : `at:${r.created_at}`);
  const deltaBySession = new Map();
  touchedIds.forEach(id => {
    const d = Number(deltas[id]) || 0;
    if (!d) return;
    const key = sessionKey(byId.get(id));
    deltaBySession.set(key, (deltaBySession.get(key) || 0) + d);
  });
  for (const [key, delta] of deltaBySession) {
    const rows = dayRows.filter(r => sessionKey(r) === key);
    const base = rows.find(r => r.calories_burned != null)?.calories_burned;
    if (base == null) continue;
    const total = Math.max(0, Math.round((Number(base) + delta) * 10) / 10);
    const filter = key.startsWith('sid:')
      ? `session_id=eq.${encodeURIComponent(key.slice(4))}`
      : `created_at=eq.${encodeURIComponent(key.slice(3))}&log_date=eq.${logDate}`;
    const r = await fetchImpl(`${supabaseUrl}/rest/v1/workout_logs?user_id=eq.${encodeURIComponent(userId)}&${filter}`, {
      method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ calories_burned: total })
    }).catch(() => null);
    if (!r || !r.ok) console.warn('save-workout-session edit: calorie update failed for', key);
  }

  return { status: 200, body: { success: true, updated: updates.length, deleted: deletes.length } };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase service role key' });
  }

  const { records, edit } = req.body || {};
  // Edit mode changes existing rows only, so it names its user directly.
  if (!edit && (!Array.isArray(records) || records.length === 0)) {
    return res.status(400).json({ error: 'records must be a non-empty array' });
  }

  // Every record must target the same user; verify that user is who the
  // caller's token says they are (or matches the caller-supplied email on
  // localhost dev, same gate as lookup-profile.js) before writing anything.
  const targetUserId = edit ? (req.body || {}).userId : records[0].user_id;
  if (!targetUserId || (!edit && records.some(r => r.user_id !== targetUserId))) {
    return res.status(400).json({ error: 'All records must share the same user_id' });
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const bodyEmail = ((req.body || {}).email || '').trim().toLowerCase();

  const svcHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  // Kick the client-row lookup off NOW, in parallel with token verification
  // below: it only needs targetUserId (already read off the body), not the
  // caller's identity, so there is no reason to wait for the auth round trip
  // first. Never rejects, so an early 401/403 return can't strand it.
  const clientRowPromise = fetch(
    `${supabaseUrl}/rest/v1/clients?user_id=eq.${encodeURIComponent(targetUserId)}&select=coach_id`,
    { headers: svcHeaders }
  ).then(r => r.json()).catch(() => []);

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

  if (!verifiedEmail) {
    return res.status(401).json({ error: 'Could not verify your session.' });
  }

  try {
    // Authorization: the caller may write these logs if they ARE the target
    // user, are the target client's attached coach, or are the super admin.
    // A token/email proves identity, not which user_id it may write to — the
    // coach's Live Log calls this endpoint to save a session ON BEHALF OF a
    // client while logged in as the COACH, so an owner-only check would 403
    // every one of those. (Confirmed 2026-08-11: a coach logged a client's
    // session and no row existed anywhere, because that 403 re-threw as the
    // original error behind a toast that was easy to miss.)
    //
    // This used to take up to four sequential round trips for a non-admin
    // coach: verify token -> look up the TARGET's email -> look up the
    // client row -> look up the COACH's email, then finally insert.
    // Resolving the CALLER's id once instead lets both comparisons be plain
    // id equality, dropping two lookups entirely; the client row is already
    // in flight from above, and it no longer needs to wait for the owner
    // check to fail before starting. So the chain is now (token verify ||
    // client row) -> caller id -> insert, with the two DB reads parallel
    // instead of chained three deep. superAdmin still short-circuits on the
    // email string alone, same as before, with zero lookups.
    //
    // ilike (not eq) for the email match: case-insensitive exact match, no
    // wildcards — same comparison the old code did by lower-casing both
    // sides, just pushed into the query instead of done in JS.
    const callerRowsPromise = fetch(
      `${supabaseUrl}/rest/v1/users?email=ilike.${encodeURIComponent(verifiedEmail)}&select=id`,
      { headers: svcHeaders }
    ).then(r => r.json()).catch(() => []);

    const [callerRows, clientRows] = await Promise.all([callerRowsPromise, clientRowPromise]);
    const callerId = (Array.isArray(callerRows) && callerRows[0]?.id) || null;
    const coachId = (Array.isArray(clientRows) && clientRows[0]?.coach_id) || null;

    const isSuperAdmin = verifiedEmail === 'subodhmankala@gmail.com';
    const isOwnLogs = !!callerId && callerId === targetUserId;
    const isClientsOwnCoach = !!callerId && !!coachId && coachId === callerId;

    if (!isOwnLogs && !isSuperAdmin && !isClientsOwnCoach) {
      return res.status(403).json({ error: 'You are not authorized to write this workout for this account.' });
    }

    if (edit) {
      const result = await editSavedSession({ svcHeaders, userId: targetUserId, edit });
      return res.status(result.status).json(result.body);
    }

    const { append } = req.body || {};
    if (append) {
      const result = await appendToSavedSession({ svcHeaders, userId: targetUserId, records, append });
      return res.status(result.status).json(result.body);
    }

    // return=minimal: the inserted rows were never used beyond counting them,
    // and echoing every set back costs payload and time on exactly the slow
    // connections this endpoint exists to rescue. (Safe here specifically
    // because this runs with the service role — the anon-key path still needs
    // representation, see restInsert.)
    //
    // Same one-column-at-a-time degrade as the client's own restInsert path
    // in databaseService.js (see its 2026-08-18 writeup) — this is the LAST
    // chance to persist a session, so a genuinely-missing optional column
    // (e.g. avg_heart_rate_bpm before its migration was run) must not lose
    // duration_seconds/calories_burned/etc. that DO exist just because they
    // happened to be insertable via the client but this fallback never got
    // the same fix. Bounded the same way: one retry per optional column.
    let recordsToInsert = records;
    let insertResp, errBody;
    for (let attempt = 0; attempt < 10; attempt++) {
      insertResp = await fetch(`${supabaseUrl}/rest/v1/workout_logs`, {
        method: 'POST',
        headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(recordsToInsert)
      });
      if (insertResp.ok) { errBody = null; break; }
      errBody = await insertResp.json().catch(() => null);
      // This workout's rows are already stored (same session_id — see
      // saveWorkoutSession's idempotency key). Report success so the caller
      // stops retrying and drops it from the offline replay queue, instead
      // of parking it forever or writing another copy.
      if (errBody?.code === '23505' && /workout_logs_session_row_key/.test(errBody.message || '')) {
        return res.status(200).json({ success: true, count: 0, alreadySaved: true });
      }
      const missingCol = errBody && (errBody.code === '42703' || errBody.code === 'PGRST204')
        ? errBody.message?.match(/'([a-z_]+)' column/)?.[1]
        : null;
      if (!missingCol) break;
      console.warn(`save-workout-session: workout_logs missing column '${missingCol}' — retrying without just that field.`);
      recordsToInsert = recordsToInsert.map(({ [missingCol]: _drop, ...rest }) => rest);
    }
    if (!insertResp.ok) {
      console.error('save-workout-session insert failed:', insertResp.status, errBody);
      return res.status(502).json({ error: (errBody && (errBody.message || errBody.error)) || 'Failed to save workout.' });
    }
    return res.status(200).json({ success: true, count: recordsToInsert.length });
  } catch (err) {
    console.error('save-workout-session error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save workout.' });
  }
}
