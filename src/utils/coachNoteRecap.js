// What the coach-note composer shows about a session: one line per exercise
// (done / skipped / still to do, top set, PR) and the reply each one fills in
// when tapped. Shared by the client-detail card (a saved session) and the
// Live Log note (the session still running).
import { sameExerciseEntry } from './exerciseName';

const isWarmup = (set) => !!set?.isWarmup || set?.setType === 'warmup';
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// A set counts when it was actually done (a live set must be ticked; every
// saved set was) and has reps, weight or time in it — empty sets never
// count (see #492).
function countedSets(sets, live) {
  return (sets || []).filter(set => {
    if (live && !set.isCompleted) return false;
    return num(set.reps) > 0 || num(set.weight) > 0 || !!set.time || num(set.distanceKm) > 0;
  });
}

// Heaviest working (non-warm-up) set weight with reps, or 0.
function bestWeight(sets) {
  return (sets || [])
    .filter(s => !isWarmup(s) && num(s.reps) > 0)
    .reduce((best, s) => Math.max(best, num(s.weight)), 0);
}

const fmtKg = (kg) => `${Math.round(kg * 10) / 10} kg`;

// An exercise's heaviest set in one earlier session, kept per session object:
// the Live Log rebuilds its recap on every render, against the whole history.
const sessionBests = new WeakMap();
function sessionBest(sess, ex) {
  if (!sessionBests.has(sess)) sessionBests.set(sess, new Map());
  const bests = sessionBests.get(sess);
  const key = `${ex.exerciseId || ''}|${ex.name}`;
  if (!bests.has(key)) {
    bests.set(key, (sess.exercises || []).reduce((best, p) => (
      sameExerciseEntry(p, ex) ? Math.max(best, bestWeight(countedSets(p.sets, false))) : best
    ), 0));
  }
  return bests.get(key);
}

/**
 * `exercises` — the session's exercises ({ name, exerciseId?, sets }).
 * `priorSessions` — earlier sessions ({ date, exercises }) for the PR check;
 *   a PR is beating the best weight ever logged before, so a first-ever
 *   attempt is never a PR.
 * `live` — sets must be ticked to count; untouched exercises are "todo".
 */
export function buildSessionRecap(exercises, priorSessions = [], { live = false } = {}) {
  return (exercises || []).map(ex => {
    const done = countedSets(ex.sets, live);
    const working = done.filter(s => !isWarmup(s));
    const top = bestWeight(done);
    let priorBest = 0;
    (priorSessions || []).forEach(sess => { priorBest = Math.max(priorBest, sessionBest(sess, ex)); });
    const isPR = top > 0 && priorBest > 0 && top > priorBest;
    const status = done.length > 0 ? 'done' : (live ? 'todo' : 'skipped');
    const topSet = working.find(s => num(s.weight) === top && top > 0) || working[0] || null;

    let detail = '';
    if (status === 'done' && topSet) {
      const reps = num(topSet.reps);
      if (top > 0 && reps > 0) detail = `${working.length} × ${reps} · ${fmtKg(top)}`;
      else if (reps > 0) detail = `${working.length} × ${reps}`;
      else if (topSet.time) detail = topSet.time;
    }

    let reply;
    if (isPR) reply = `That ${ex.name} PR — ${fmtKg(top)}! Huge.`;
    else if (status === 'done') reply = `${ex.name} looked strong today — nice work.`;
    else if (status === 'todo') reply = `We'll get ${ex.name} in next time — no stress.`;
    else reply = `Noticed ${ex.name} was skipped — anything bothering you?`;

    return { name: ex.name, status, detail, isPR, prWeight: isPR ? fmtKg(top) : null, reply };
  });
}

// A first name fit to put inside a message. Usernames like "gk.goginenikiran"
// or "kiran_92" aren't a name, so the message leaves the name out instead.
export function noteFirstName(userName) {
  const first = String(userName || '').trim().split(/\s+/)[0] || '';
  if (!first || /[._@\d]/.test(first)) return null;
  return first;
}

/**
 * The three quick replies: short pill label + the full text it fills in.
 * `statPhrase` from buildSessionStatPhrase ("43 min and 143 kcal").
 */
export function buildQuickReplies(firstName, statPhrase) {
  const hi = firstName ? `, ${firstName}` : '';
  return [
    {
      label: 'Great session',
      text: statPhrase ? `Great session${hi}! ${statPhrase} — solid work.` : `Great work today${hi}! Really solid session.`,
    },
    { label: 'Proud of you', text: 'Proud of your consistency this week — keep it going.' },
    { label: 'How did it feel?', text: 'How did that feel? Let me know if anything was too easy or too tough.' },
  ];
}

/**
 * workout_logs rows (one client) -> { latestDate, exercises, latestRows,
 * priorSessions } for the home card: the newest session's exercises plus
 * earlier sessions for the PR check. Rows are the raw table shape.
 */
export function splitLogRowsForRecap(rows) {
  const byDate = {};
  (rows || []).forEach(r => {
    if (!r.exercise_name || !r.log_date) return;
    ((byDate[r.log_date] = byDate[r.log_date] || {})[r.exercise_name] = (byDate[r.log_date][r.exercise_name] || [])).push(r);
  });
  const dates = Object.keys(byDate).sort().reverse();
  const toExercises = (day) => Object.entries(day).map(([name, list]) => ({
    name,
    sets: list
      .slice()
      .sort((a, b) => (a.set_number || 0) - (b.set_number || 0))
      .map(r => ({
        reps: r.reps,
        weight: r.weight_kg,
        setType: r.set_type || null,
        isWarmup: r.set_type === 'warmup',
        ...(r.distance_km != null ? { distanceKm: r.distance_km } : {}),
        ...(r.cardio_duration_seconds != null ? { time: String(r.cardio_duration_seconds) } : {}),
      })),
  }));
  const latestDate = dates[0] || null;
  return {
    latestDate,
    exercises: latestDate ? toExercises(byDate[latestDate]) : [],
    latestRows: latestDate ? Object.values(byDate[latestDate]).flat() : [],
    priorSessions: dates.slice(1).map(d => ({ date: d, exercises: toExercises(byDate[d]) })),
  };
}
