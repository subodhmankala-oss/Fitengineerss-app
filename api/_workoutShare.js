// Server side of the read-only workout links — see sql/workout_shares.sql.
// Underscore file: not a Serverless Function of its own (12-function cap).
import { dropDuplicateSessionBatches } from '../src/utils/workoutLogDedupe.js';
import {
  SHARE_TOKEN_RE, sessionKeyOf, shapeSharedWorkout, sharedWorkoutTotals,
} from '../src/utils/workoutShare.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROW_SELECT = 'id,user_id,log_date,exercise_name,set_number,reps,weight_kg,distance_km,'
  + 'cardio_duration_seconds,set_type,plan_name,duration_seconds,calories_burned,session_id,session_row,created_at';
const enc = encodeURIComponent;

export function makeRest({ supabaseUrl, serviceKey, fetchImpl = (...a) => fetch(...a) }) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  return {
    async get(path) {
      const r = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, { headers });
      const body = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(body)) throw new Error(`workout-share read failed (${r.status})`);
      return body;
    },
    async write(path, method, body, prefer = 'return=minimal') {
      const r = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: prefer },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!r.ok) throw new Error(`workout-share write failed (${r.status}): ${await r.text().catch(() => '')}`);
    },
  };
}

// Saved order: the order exercises were done in.
const dayRows = async (rest, userId, logDate) => dropDuplicateSessionBatches(await rest.get(
  `workout_logs?user_id=eq.${enc(userId)}&log_date=eq.${enc(logDate)}&select=${ROW_SELECT}`
  + '&order=created_at.asc,session_row.asc.nullslast,set_number.asc,id.asc&limit=1000'
));

const toShare = (row) => ({
  token: row.token,
  logDate: row.log_date,
  showName: row.show_name,
  showMap: row.show_map,
  showWeights: row.show_weights,
  showCalories: row.show_calories,
});

const listShares = async (rest, userId) => (await rest.get(
  `workout_shares?user_id=eq.${enc(userId)}&select=token,log_date,show_name,show_map,show_weights,show_calories&order=log_date.desc&limit=1000`
)).map(toShare);

// Owner's side. `userId` is the verified caller, never taken from the body.
// ops: list | save { logDate, token, sessionId?, flags, bodySex } |
//      flags { logDate, flags } (what shows, nothing else) | stop { logDate }
export async function ownerShareOp(rest, userId, body) {
  const { op, logDate } = body || {};
  if (op === 'list') return { status: 200, body: { shares: await listShares(rest, userId) } };
  if (!DATE_RE.test(logDate || '')) return { status: 400, body: { error: 'logDate must be YYYY-MM-DD' } };
  const match = `workout_shares?user_id=eq.${enc(userId)}&log_date=eq.${enc(logDate)}`;

  if (op === 'stop') {
    await rest.write(match, 'DELETE');
    return { status: 200, body: { shares: await listShares(rest, userId) } };
  }

  const flagCols = {
    show_name: body.flags?.showName !== false,
    show_map: body.flags?.showMap !== false,
    show_weights: body.flags?.showWeights !== false,
    show_calories: body.flags?.showCalories !== false,
    updated_at: new Date().toISOString(),
  };

  if (op === 'flags') {
    await rest.write(match, 'PATCH', flagCols);
    return { status: 200, body: { shares: await listShares(rest, userId) } };
  }

  if (op === 'save') {
    const { token, sessionId, bodySex } = body;
    if (!SHARE_TOKEN_RE.test(token || '')) return { status: 400, body: { error: 'Could not make the link. Try again.' } };
    const existing = (await rest.get(`${match}&select=token,session_keys`))[0] || null;
    const rows = await dayRows(rest, userId, logDate);
    // sessionId: shared from the card shown right after Save — its rows may
    // still be on their way, so the link is tied to the session itself.
    const keys = new Set(sessionId ? [...(existing?.session_keys || []), `sid:${String(sessionId).slice(0, 120)}`] : rows.map(sessionKeyOf));
    if (keys.size === 0) return { status: 404, body: { error: 'No saved workout on that day.' } };
    const row = {
      session_keys: [...keys],
      ...flagCols,
      body_sex: bodySex === 'male' || bodySex === 'female' ? bodySex : null,
    };
    // A link already out there keeps working; only its settings change. The
    // reply carries the token really in use.
    if (existing) await rest.write(match, 'PATCH', row);
    else await rest.write('workout_shares', 'POST', { ...row, token, user_id: userId, log_date: logDate });
    return { status: 200, body: { shares: await listShares(rest, userId) } };
  }

  return { status: 400, body: { error: `Unknown workout-share op: ${op}` } };
}

// Heaviest set of each exercise before that day, for the "New best" tag.
async function bestsBefore(rest, userId, logDate, names) {
  const pairs = await Promise.all(names.slice(0, 20).map(async (name) => {
    const rows = await rest.get(
      `workout_logs?user_id=eq.${enc(userId)}&log_date=lt.${enc(logDate)}&exercise_name=eq.${enc(name)}`
      + '&or=(set_type.is.null,set_type.neq.warmup)&reps=gt.0&select=weight_kg&order=weight_kg.desc.nullslast&limit=1'
    ).catch(() => []);
    return [name, rows[0]?.weight_kg ?? 0];
  }));
  return Object.fromEntries(pairs);
}

// Visitor's side: the workout behind a link, or null when there is none
// (wrong link, sharing stopped, workout deleted).
export async function readSharedWorkout(rest, token, { withBests = true } = {}) {
  if (!SHARE_TOKEN_RE.test(token || '')) return null;
  const share = (await rest.get(`workout_shares?token=eq.${enc(token)}&select=*&limit=1`))[0];
  if (!share) return null;
  const keys = new Set(share.session_keys || []);
  const rows = (await dayRows(rest, share.user_id, share.log_date)).filter(r => keys.has(sessionKeyOf(r)));
  if (rows.length === 0) return null;
  const [users, previousBests] = await Promise.all([
    share.show_name ? rest.get(`users?id=eq.${enc(share.user_id)}&select=full_name&limit=1`) : [],
    withBests && share.show_weights
      ? bestsBefore(rest, share.user_id, share.log_date, [...new Set(rows.map(r => r.exercise_name))])
      : {},
  ]);
  return shapeSharedWorkout({ share, rows, fullName: users[0]?.full_name, previousBests });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// What chat apps read to draw the message preview (vercel.json sends only
// their link bots here; people get the app's own page).
export function sharePreviewHtml(workout, { origin }) {
  const title = workout ? (workout.name ? `${workout.name}’s ${workout.title}` : workout.title) : 'Workout not shared anymore';
  const sets = workout ? sharedWorkoutTotals(workout).sets : 0;
  const facts = workout
    ? [`${sets} ${sets === 1 ? 'set' : 'sets'}`, workout.durationSeconds ? `${Math.max(1, Math.round(workout.durationSeconds / 60))} min` : null].filter(Boolean).join(' · ')
    : '';
  const desc = workout ? `${facts}. Tap to see every set.` : 'Fitengineers';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>`
    + '<meta name="robots" content="noindex">'
    + `<meta property="og:site_name" content="Fitengineers"><meta property="og:type" content="website">`
    + `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">`
    + `<meta property="og:image" content="${esc(origin)}/icons/icon-192.png"><meta name="twitter:card" content="summary">`
    + `</head><body>${esc(title)}</body></html>`;
}
