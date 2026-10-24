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
//   action=testimonials        (client testimonials — the ONLY path to
//                               coach_testimonials, which has no RLS policies;
//                               see sql/coach_testimonials.sql)

import {
  cleanTestimonialInput, shortClientName, monthsTrained, TESTIMONIAL_STATUSES, cleanGoogleReviewUrl,
} from '../src/utils/testimonials.js';

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

// ─── testimonials ───
// One action, `op` in the body:
//   list    client: their own testimonial + their coach's shown ones
//           coach:  every testimonial written for them + clients to ask
//   save    client only — upserts their one testimonial for their current
//           coach and sends it back to 'pending' for the coach to approve
//   delete  client only — removes their own
//   status  coach only — { id, status: 'shown' | 'hidden' } on their own rows
// coach_id / client_user_id always come from the caller's clients row,
// never from the request body.
const svcGet = (path) => fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: svcHeaders })
  .then(async r => {
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${path.split('?')[0]} read failed (${r.status})`);
    return Array.isArray(data) ? data : [];
  });

const TESTIMONIAL_SELECT = 'id,client_user_id,quote,result,status,updated_at,client:users!coach_testimonials_client_user_id_fkey(full_name)';

async function listTestimonialsForClient(callerId, clientRow) {
  const coachId = clientRow.coach_id;
  const rows = await svcGet(
    `coach_testimonials?coach_id=eq.${encodeURIComponent(coachId)}` +
    `&or=(status.eq.shown,client_user_id.eq.${encodeURIComponent(callerId)})` +
    `&select=${TESTIMONIAL_SELECT}&order=updated_at.desc`
  );
  const writerIds = [...new Set(rows.map(r => r.client_user_id))];
  const joined = writerIds.length
    ? await svcGet(`clients?user_id=in.(${writerIds.map(encodeURIComponent).join(',')})&select=user_id,created_at`)
    : [];
  const joinedAt = Object.fromEntries(joined.map(c => [c.user_id, c.created_at]));
  const mine = rows.find(r => r.client_user_id === callerId) || null;
  // Best-effort: a missing link (or column) just means no Google button.
  const coachRows = await svcGet(`coaches?user_id=eq.${encodeURIComponent(coachId)}&select=google_review_url&limit=1`).catch(() => []);
  const toPublic = (r) => ({
    id: r.id,
    quote: r.quote,
    result: r.result || '',
    clientName: shortClientName(r.client?.full_name),
    monthsTrained: monthsTrained(joinedAt[r.client_user_id]),
  });
  return {
    role: 'client',
    shown: rows.filter(r => r.status === 'shown').map(toPublic),
    mine: mine ? { ...toPublic(mine), status: mine.status } : null,
    googleReviewUrl: cleanGoogleReviewUrl(coachRows[0]?.google_review_url),
  };
}

async function listTestimonialsForCoach(callerId) {
  const [rows, clients] = await Promise.all([
    svcGet(
      `coach_testimonials?coach_id=eq.${encodeURIComponent(callerId)}` +
      `&select=${TESTIMONIAL_SELECT}&order=updated_at.desc`
    ),
    svcGet(
      `clients?coach_id=eq.${encodeURIComponent(callerId)}` +
      `&select=user_id,phone_number,created_at,user:users!clients_user_id_fkey(full_name,phone)`
    ),
  ]);
  const byClient = Object.fromEntries(clients.map(c => [c.user_id, c]));
  const wrote = new Set(rows.map(r => r.client_user_id));
  return {
    role: 'coach',
    testimonials: rows.map(r => ({
      id: r.id,
      quote: r.quote,
      result: r.result || '',
      status: r.status,
      clientName: r.client?.full_name || 'Client',
      monthsTrained: monthsTrained(byClient[r.client_user_id]?.created_at),
    })),
    // Clients who haven't written one yet — the coach's "Ask" list.
    askable: clients
      .filter(c => !wrote.has(c.user_id))
      .map(c => ({
        userId: c.user_id,
        name: c.user?.full_name || 'Client',
        phone: c.phone_number || c.user?.phone || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

async function handleTestimonials(req, res) {
  const verifiedEmail = await resolveVerifiedEmail(req);
  if (!verifiedEmail) return res.status(401).json({ error: 'Could not verify your session.' });

  const { op } = req.body || {};
  try {
    const callerId = await resolveOwnUserId(verifiedEmail);
    if (!callerId) return res.status(403).json({ error: 'No matching account for your session.' });

    const [clientRows, coachRows] = await Promise.all([
      svcGet(`clients?user_id=eq.${encodeURIComponent(callerId)}&select=coach_id&limit=1`),
      svcGet(`coaches?user_id=eq.${encodeURIComponent(callerId)}&select=id&limit=1`),
    ]);
    const clientRow = clientRows[0] || null;
    const isCoach = coachRows.length > 0;
    const hasCoach = !!clientRow?.coach_id;

    if (op === 'list') {
      if (isCoach) return res.status(200).json(await listTestimonialsForCoach(callerId));
      if (hasCoach) return res.status(200).json(await listTestimonialsForClient(callerId, clientRow));
      return res.status(200).json({ role: 'none', shown: [], mine: null });
    }

    if (op === 'save' || op === 'delete') {
      if (!hasCoach) return res.status(403).json({ error: 'Connect to a coach before writing a testimonial.' });
      const match = `client_user_id=eq.${encodeURIComponent(callerId)}&coach_id=eq.${encodeURIComponent(clientRow.coach_id)}`;
      if (op === 'delete') {
        const resp = await fetch(`${supabaseUrl}/rest/v1/coach_testimonials?${match}`, {
          method: 'DELETE', headers: { ...svcHeaders, Prefer: 'return=minimal' }
        });
        if (!resp.ok) return res.status(502).json({ error: 'Could not delete your testimonial.' });
        return res.status(200).json(await listTestimonialsForClient(callerId, clientRow));
      }
      const clean = cleanTestimonialInput(req.body);
      if (!clean) return res.status(400).json({ error: 'Write a few words first.' });
      const resp = await fetch(`${supabaseUrl}/rest/v1/coach_testimonials?on_conflict=client_user_id,coach_id`, {
        method: 'POST',
        headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          client_user_id: callerId,
          coach_id: clientRow.coach_id,
          quote: clean.quote,
          result: clean.result || null,
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
      });
      if (!resp.ok) {
        console.error('save-user-data testimonials save failed:', resp.status, await resp.text().catch(() => ''));
        return res.status(502).json({ error: 'Could not save your testimonial.' });
      }
      return res.status(200).json(await listTestimonialsForClient(callerId, clientRow));
    }

    if (op === 'status') {
      const { id, status } = req.body || {};
      if (!isCoach) return res.status(403).json({ error: 'Only the coach can show or hide testimonials.' });
      if (!id || !TESTIMONIAL_STATUSES.includes(status) || status === 'pending') {
        return res.status(400).json({ error: 'id and a status of shown or hidden are required.' });
      }
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/coach_testimonials?id=eq.${encodeURIComponent(id)}&coach_id=eq.${encodeURIComponent(callerId)}`,
        {
          method: 'PATCH',
          headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ status })
        }
      );
      const data = await resp.json().catch(() => null);
      if (!resp.ok) return res.status(502).json({ error: 'Could not update the testimonial.' });
      if (!Array.isArray(data) || data.length === 0) return res.status(404).json({ error: 'Testimonial not found.' });
      return res.status(200).json(await listTestimonialsForCoach(callerId));
    }

    return res.status(400).json({ error: `Unknown testimonials op: ${op}` });
  } catch (err) {
    console.error('save-user-data testimonials error:', err);
    return res.status(500).json({ error: 'Could not load testimonials.' });
  }
}

const ACTION_HANDLERS = {
  'body-measurement': handleBodyMeasurement,
  'tracker-log': handleTrackerLog,
  'progress-history': handleProgressHistory,
  'chat-message': handleChatMessage,
  'testimonials': handleTestimonials
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
