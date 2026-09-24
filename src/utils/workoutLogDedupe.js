// workout_logs has no session table — one saved workout is N set rows that
// share a created_at (one bulk INSERT) and carry the session's duration/
// calories duplicated onto every row. Until 2026-09 the same workout could be
// written again and again: the "self-healing resync" in WorkoutTracker re-
// uploaded any local session whose date was missing from a history read, and
// that read was silently capped at PostgREST's 1000-row limit, so older dates
// always looked missing. Every re-upload made the next read MORE truncated,
// and a session rebuilt from those duplicated rows carried every set twice.
// Worst case found: one session written 62 times; one client at 62k rows.
//
// Any screen that sums per saved batch (Home's weekly/monthly calories, sets,
// volume) multiplied that workout by however many copies existed. New saves
// are now idempotent (session_id + session_row unique index, see
// saveWorkoutSession), but copies already in the table — and copies still
// written by clients running a stale cached build — are dropped here, at the
// single read path every screen shares (getWorkoutLogsForUser).
//
// Two batches are the same workout when they share the user, date, plan,
// session calories/duration AND the same set of distinct set rows. Distinct,
// not counted: a copy rebuilt from duplicated rows has every set twice (and
// renumbered), so it must still match the original. set_number is ignored for
// the same reason.

// created_at alone isn't enough: a few older bulk writes put more than one
// date/plan into a single INSERT, and those must stay separate batches, or
// a unique session would be dropped along with a duplicate it shared an
// INSERT with.
function batchKey(row) {
  if (row.session_id) return `sid:${row.session_id}`;
  return row.created_at ? `at:${row.created_at}|${row.log_date || ''}|${row.plan_name || ''}` : null;
}

function num(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
}

function rowTuple(row) {
  return [
    row.exercise_name || '',
    num(row.reps),
    num(row.weight_kg),
    num(row.distance_km),
    num(row.cardio_duration_seconds),
    row.set_type || ''
  ].join('~');
}

function batchSignature(rows) {
  const first = rows[0];
  const tuples = Array.from(new Set(rows.map(rowTuple))).sort();
  return [
    first.user_id || '',
    first.log_date || '',
    (first.plan_name || '').trim(),
    num(first.calories_burned),
    num(first.duration_seconds),
    tuples.join('|')
  ].join('#');
}

// Returns `rows` minus every batch that repeats an earlier-saved batch.
// Order of the surviving rows is preserved. Rows with no created_at and no
// session_id can't be grouped into a batch, so they always pass through.
export function dropDuplicateSessionBatches(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const batches = new Map();
  rows.forEach(row => {
    const key = batchKey(row);
    if (!key) return;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(row);
  });
  if (batches.size < 2) return rows;

  // Earliest save wins, so the kept copy is the one written when the workout
  // actually happened.
  const ordered = Array.from(batches.entries()).sort(([, a], [, b]) => {
    const at = String(a[0].created_at || '');
    const bt = String(b[0].created_at || '');
    return at < bt ? -1 : at > bt ? 1 : 0;
  });

  const seen = new Set();
  const dropped = new Set();
  ordered.forEach(([key, batchRows]) => {
    const sig = batchSignature(batchRows);
    if (seen.has(sig)) dropped.add(key);
    else seen.add(sig);
  });
  if (dropped.size === 0) return rows;

  return rows.filter(row => {
    const key = batchKey(row);
    return !key || !dropped.has(key);
  });
}
