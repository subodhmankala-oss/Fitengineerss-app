// Consolidated service-role write fallback for the "self-service" Phase 2
// tables (see the write-lockdown plan): body_measurements, tracker_logs,
// progress_history, chat_messages. Same shape as api/save-workout-session.js
// and api/save-workout-draft.js — the client attempts a direct insert/upsert
// first (with its own real session token); if that fails (including the
// exact "session not fully synced yet" window those two files document),
// databaseService.js falls back to this endpoint, which verifies the caller
// server-side and writes with the service role key (bypasses RLS entirely).
//
// Public URLs:
//   action=body-measurement    (client's own measurement entry)
//   action=tracker-log         (client's own daily tracker upsert)
//   action=progress-history    (client's own 30-day progress bulk upsert)
//   action=chat-message        (either the client or their coach)

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const svcHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

// Same resolveVerifiedEmail shape as api/data-read.js and
// api/save-workout-session.js — never trust an id/email the client claims
// when a bearer token is present.
async function resolveVerifiedEmail(req) {
  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken || accessToken === anonKey) return null;
  try {
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` }
    });
    if (!userResp.ok) return null;
    const authUser = await userResp.json().catch(() => null);
    return (authUser?.email || '').trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

async function resolveOwnUserId(verifiedEmail) {
  const rows = await fetch(
    `${supabaseUrl}/rest/v1/users?email=ilike.${encodeURIComponent(verifiedEmail)}&select=id`,
    { headers: svcHeaders }
  ).then(r => r.json()).catch(() => []);
  return (Array.isArray(rows) && rows[0]?.id) || null;
}

// ─── body-measurement ───
async function handleBodyMeasurement(req, res) {
  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });

  const { userId, measurements } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required.' });

  try {
    const callerId = await resolveOwnUserId(verifiedEmail);
    // Self-service only — saveBodyMeasurement is only ever called for the
    // client's own account (see its comment in databaseService.js).
    if (!callerId || callerId !== userId) {
      return res.status(403).json({ error: 'You can only save your own measurements.' });
    }

    const resp = await fetch(`${supabaseUrl}/rest/v1/body_measurements`, {
      method: 'POST',
      headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: userId, measurements: measurements || {} })
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('save-user-data body-measurement failed:', resp.status, data);
      return res.status(502).json({ error: 'Failed to save measurement.' });
    }
    const row = Array.isArray(data) ? data[0] : data;

    // Same weight_kg sync onto clients as the client-side path — best-effort.
    const weightVal = parseFloat(measurements?.weight);
    if (Number.isFinite(weightVal)) {
      await fetch(`${supabaseUrl}/rest/v1/clients?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ weight_kg: weightVal })
      }).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      entry: { id: row.id, userId: row.user_id, measurements: row.measurements || {}, measuredAt: row.measured_at }
    });
  } catch (err) {
    console.error('save-user-data body-measurement error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save measurement.' });
  }
}

// ─── tracker-log ───
async function handleTrackerLog(req, res) {
  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });

  const { log } = req.body || {};
  if (!log) return res.status(400).json({ error: 'log is required.' });

  try {
    const callerId = await resolveOwnUserId(verifiedEmail);
    if (!callerId) return res.status(403).json({ error: 'No matching account for your session.' });

    const resp = await fetch(`${supabaseUrl}/rest/v1/tracker_logs?on_conflict=user_id,log_date`, {
      method: 'POST',
      headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: callerId,
        log_date: log.date || new Date().toISOString().split('T')[0],
        water_glasses: parseInt(log.waterGlasses || '0', 10),
        synced_steps: parseInt(log.syncedSteps || '0', 10),
        logged_calories: parseInt(log.loggedCalories || '0', 10),
        logged_protein: parseInt(log.loggedProtein || '0', 10),
        logged_fats: parseInt(log.loggedFats || '0', 10),
        walk_lunch_dinner: log.walkLunchDinner === 'true' || log.walkLunchDinner === true
      })
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => null);
      console.error('save-user-data tracker-log failed:', resp.status, errBody);
      return res.status(502).json({ error: 'Failed to sync tracker log.' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('save-user-data tracker-log error:', err);
    return res.status(500).json({ error: err.message || 'Failed to sync tracker log.' });
  }
}

// ─── progress-history ───
async function handleProgressHistory(req, res) {
  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });

  const { history } = req.body || {};
  if (!history || !history.water) return res.status(400).json({ error: 'history is required.' });

  try {
    const callerId = await resolveOwnUserId(verifiedEmail);
    if (!callerId) return res.status(403).json({ error: 'No matching account for your session.' });

    const records = [];
    for (let i = 0; i < 30; i++) {
      records.push({
        user_id: callerId,
        day_number: i + 1,
        water_val: parseFloat(history.water[i]?.val || '0.0'),
        protein_val: parseInt(history.protein[i]?.val || '0', 10),
        fats_val: parseInt(history.fats[i]?.val || '0', 10),
        lifting_val: parseFloat(history.lifting[i]?.val || '0.0')
      });
    }

    const resp = await fetch(`${supabaseUrl}/rest/v1/progress_history?on_conflict=user_id,day_number`, {
      method: 'POST',
      headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(records)
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => null);
      console.error('save-user-data progress-history failed:', resp.status, errBody);
      return res.status(502).json({ error: 'Failed to sync progress history.' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('save-user-data progress-history error:', err);
    return res.status(500).json({ error: err.message || 'Failed to sync progress history.' });
  }
}

// ─── chat-message ───
async function handleChatMessage(req, res) {
  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });

  const { clientId, sender, message } = req.body || {};
  if (!clientId || !sender || !message?.trim()) {
    return res.status(400).json({ error: 'clientId, sender, and message are required.' });
  }

  try {
    const [callerId, clientRows] = await Promise.all([
      resolveOwnUserId(verifiedEmail),
      fetch(`${supabaseUrl}/rest/v1/clients?user_id=eq.${encodeURIComponent(clientId)}&select=coach_id`, { headers: svcHeaders })
        .then(r => r.json()).catch(() => [])
    ]);
    if (!callerId) return res.status(403).json({ error: 'No matching account for your session.' });

    const coachId = (Array.isArray(clientRows) && clientRows[0]?.coach_id) || null;
    const isTheClient = callerId === clientId;
    const isTheirCoach = !!coachId && coachId === callerId;

    if (!isTheClient && !isTheirCoach) {
      return res.status(403).json({ error: 'You are not authorized to message this thread.' });
    }
    // sender must match who's actually calling — a client can't post as
    // 'coach' and vice versa. The client's own sender value is 'user', not
    // 'client' (see CoachChat.jsx/TrainerDashboard.jsx callers of
    // saveChatMessage — chat_messages_sender_check only allows 'user'/'coach').
    if ((sender === 'user' && !isTheClient) || (sender === 'coach' && !isTheirCoach)) {
      return res.status(403).json({ error: 'sender does not match your role in this conversation.' });
    }

    const resp = await fetch(`${supabaseUrl}/rest/v1/chat_messages`, {
      method: 'POST',
      headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ client_id: clientId, sender, message })
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('save-user-data chat-message failed:', resp.status, data);
      return res.status(502).json({ error: 'Failed to send message.' });
    }
    return res.status(200).json({ message: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    console.error('save-user-data chat-message error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send message.' });
  }
}

const ACTION_HANDLERS = {
  'body-measurement': handleBodyMeasurement,
  'tracker-log': handleTrackerLog,
  'progress-history': handleProgressHistory,
  'chat-message': handleChatMessage
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
