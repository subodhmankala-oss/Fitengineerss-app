// Server side of the read-only workout links — see sql/workout_shares.sql.
// Underscore file: not a Serverless Function of its own (12-function cap).
import { dropDuplicateSessionBatches } from '../src/utils/workoutLogDedupe.js';
import {
  SHARE_TOKEN_RE, firstNameOf, groupDayWorkouts, sessionKeyOf, shapeSharedWorkout, sharedWorkoutTotals,
} from '../src/utils/workoutShare.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROW_SELECT = 'id,user_id,log_date,exercise_name,set_number,reps,weight_kg,distance_km,'
  + 'cardio_duration_seconds,set_type,plan_name,duration_seconds,calories_burned,session_id,session_row,created_at';
const enc = encodeURIComponent;
// Base64 JPEG (they all start /9j/).
const IMAGE_RE = /^\/9j\/[A-Za-z0-9+/]+={0,2}$/;
const SHARE_SELECT = 'token,user_id,log_date,session_keys,show_name,show_map,show_weights,show_calories,body_sex';

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
  key: row.share_key,
  showName: row.show_name,
  showMap: row.show_map,
  showWeights: row.show_weights,
  showCalories: row.show_calories,
});

const listShares = async (rest, userId) => (await rest.get(
  `workout_shares?user_id=eq.${enc(userId)}&active=is.true&select=token,log_date,share_key,show_name,show_map,show_weights,show_calories&order=log_date.desc&limit=1000`
)).map(toShare);

const clip = (v, max) => String(v ?? '').trim().slice(0, max);
const wholeNumber = (v) => (Number.isFinite(Number(v)) && v != null ? Math.max(0, Math.min(1e6, Math.round(Number(v)))) : null);

// Owner's side. `userId` is the verified caller, never taken from the body.
// ops: list
//      prepare { logDate, key, token, image, bodySex, title, sets, durationSeconds }
//        — uploads the message picture; the link stays off
//      save { logDate, key, token, flags, bodySex, title, sets, durationSeconds }
//      flags { logDate, key, flags } — what shows, nothing else (also on a
//        prepared link that isn't on yet)
//      stop { logDate, key }
// `key` is the workout's main session key (groupDayWorkouts); one link each.
export async function ownerShareOp(rest, userId, body) {
  const { op, logDate, token, bodySex } = body || {};
  const done = async () => ({ status: 200, body: { shares: await listShares(rest, userId) } });
  if (op === 'list') return done();
  if (!['prepare', 'save', 'flags', 'stop'].includes(op)) return { status: 400, body: { error: `Unknown workout-share op: ${op}` } };
  if (!DATE_RE.test(logDate || '')) return { status: 400, body: { error: 'logDate must be YYYY-MM-DD' } };
  const key = clip(body.key, 140);
  if (!/^(sid|at):./.test(key)) return { status: 400, body: { error: 'Update the app, then share again.' } };
  const match = `workout_shares?user_id=eq.${enc(userId)}&share_key=eq.${enc(key)}`;

  if (op === 'stop') {
    await rest.write(match, 'DELETE');
    return done();
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
    return done();
  }

  if (!SHARE_TOKEN_RE.test(token || '')) return { status: 400, body: { error: 'Could not make the link. Try again.' } };
  const image = body.image;
  if (op === 'prepare' && (typeof image !== 'string' || image.length > 400000 || !IMAGE_RE.test(image))) {
    return { status: 400, body: { error: 'That preview picture is not usable.' } };
  }

  const readExisting = async () => (await rest.get(`${match}&select=token,active`))[0] || null;
  const [existingRow, rows] = await Promise.all([readExisting(), dayRows(rest, userId, logDate)]);
  let existing = existingRow;
  // Right after Save the rows may still be on their way, so a session that
  // isn't there yet is tied to its own key.
  const group = groupDayWorkouts(rows).find(g => g.keys.includes(key));
  if (!group && !key.startsWith('sid:')) return { status: 404, body: { error: 'No saved workout on that day.' } };
  const facts = {
    session_keys: group ? group.keys : [key],
    preview_title: clip(body.title || group?.title, 120) || null,
    preview_sets: wholeNumber(body.sets),
    preview_seconds: wholeNumber(body.durationSeconds),
    body_sex: bodySex === 'male' || bodySex === 'female' ? bodySex : null,
  };
  const fresh = { user_id: userId, log_date: logDate, share_key: key, token };

  if (op === 'prepare') {
    if (existing) await rest.write(match, 'PATCH', { ...facts, preview_image: image, ...(existing.active ? {} : { ...flagCols, token }) });
    // The link may be sent (saved) at this very moment: then that row stands.
    else {
      await rest.write('workout_shares?on_conflict=user_id,share_key', 'POST', { ...fresh, ...facts, ...flagCols, preview_image: image, active: false }, 'resolution=ignore-duplicates,return=minimal');
      await rest.write(match, 'PATCH', { preview_image: image });
    }
    return done();
  }

  const row = { ...facts, ...flagCols };
  if (!existing) {
    try {
      await rest.write('workout_shares', 'POST', { ...fresh, ...row });
    } catch (err) {
      // The sheet's own "prepare" got there first.
      existing = await readExisting();
      if (!existing) throw err;
    }
  }
  // A link already out there keeps working; only its settings change. The
  // reply carries the token really in use.
  if (existing) await rest.write(match, 'PATCH', existing.active ? row : { ...row, token, active: true });
  return done();
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
  const share = (await rest.get(`workout_shares?token=eq.${enc(token)}&active=is.true&select=${SHARE_SELECT}&limit=1`))[0];
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

// A link being sent: chat apps look at it the moment it lands in the message
// box, often before "save" has gone through, and would show "not shared". So
// the message preview (never the workout) also answers for a link prepared in
// the last few minutes. Only the sender knows its token then.
const DRAFT_MS = 15 * 60 * 1000;
const previewable = () => `or=(active.is.true,updated_at.gte.${enc(new Date(Date.now() - DRAFT_MS).toISOString())})`;

// The message picture as bytes, or null. It shows the muscle map, so it goes
// when that is switched off, and with the link. One read: chat apps give up
// on slow pictures. (Deleting the workout deletes its link.)
export async function readSharePicture(rest, token) {
  if (!SHARE_TOKEN_RE.test(token || '')) return null;
  const row = (await rest.get(`workout_shares?token=eq.${enc(token)}&${previewable()}&show_map=is.true&select=preview_image&limit=1`))[0];
  return row?.preview_image ? Buffer.from(row.preview_image, 'base64') : null;
}

// What the message preview says, in one read: { title, name, sets,
// durationSeconds, picture (is there one) }, or null when the link is off.
export async function readSharePreview(rest, token) {
  if (!SHARE_TOKEN_RE.test(token || '')) return null;
  const row = (await rest.get(
    `workout_shares?token=eq.${enc(token)}&${previewable()}&limit=1`
    + '&select=show_name,show_map,has_picture,preview_title,preview_sets,preview_seconds,users(full_name)'
  ))[0];
  if (!row) return null;
  if (row.preview_title) {
    return {
      title: row.preview_title,
      name: row.show_name ? firstNameOf(row.users?.full_name) : null,
      sets: row.preview_sets,
      durationSeconds: row.preview_seconds,
      picture: !!(row.show_map && row.has_picture),
    };
  }
  // Shared before these were kept with the link.
  const workout = await readSharedWorkout(rest, token, { withBests: false });
  return workout && {
    title: workout.title,
    name: workout.name,
    sets: sharedWorkoutTotals(workout).sets,
    durationSeconds: workout.durationSeconds,
    picture: !!(row.show_map && row.has_picture),
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// What chat apps read to draw the message preview (vercel.json sends only
// their link bots here; people get the app's own page).
export function sharePreviewHtml(preview, { origin, token }) {
  const title = preview ? (preview.name ? `${preview.name}’s ${preview.title}` : preview.title) : 'Workout not shared anymore';
  const facts = preview
    ? [
      preview.sets ? `${preview.sets} ${preview.sets === 1 ? 'set' : 'sets'}` : null,
      preview.durationSeconds ? `${Math.max(1, Math.round(preview.durationSeconds / 60))} min` : null,
    ].filter(Boolean).join(' · ')
    : '';
  const desc = preview ? `Workout on Fitengineers${facts ? `: ${facts}` : ''}. Tap to see every set.` : 'Fitengineers';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>`
    + '<meta name="robots" content="noindex">'
    + `<meta property="og:site_name" content="Fitengineers"><meta property="og:type" content="website">`
    + `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">`
    + (preview?.picture
      ? `<meta property="og:image" content="${esc(origin)}/w/${esc(token)}/preview.jpg"><meta property="og:image:type" content="image/jpeg">`
        + '<meta property="og:image:width" content="960"><meta property="og:image:height" content="504"><meta name="twitter:card" content="summary_large_image">'
      : `<meta property="og:image" content="${esc(origin)}/icons/icon-512.png"><meta property="og:image:width" content="512"><meta property="og:image:height" content="512"><meta name="twitter:card" content="summary">`)
    + `</head><body>${esc(title)}</body></html>`;
}
