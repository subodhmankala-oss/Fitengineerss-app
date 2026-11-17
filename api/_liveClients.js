// "Who is training right now?" for the coach's client list (pulsing green
// today dot). A workout_drafts row alone is not enough: abandoned sessions
// sit at timer_status 'running' for weeks (checked 2026-11-18). The draft
// autosaves on every set change, so a live session keeps updated_at fresh —
// running AND saved within LIVE_WINDOW_MINUTES counts as training now.
// Both sources count: the client's own session and the coach's Live Log.
export const LIVE_WINDOW_MINUTES = 20;

export function liveSince(now = Date.now()) {
  return new Date(now - LIVE_WINDOW_MINUTES * 60 * 1000).toISOString();
}

// workout_drafts rows ({ user_id, timer_status, updated_at }) → unique
// user ids training now. Re-checks the filter the query already applied so a
// looser query (or clock skew) can't light up a stale session.
export function liveUserIds(rows, now = Date.now()) {
  const since = Date.parse(liveSince(now));
  const ids = new Set();
  (Array.isArray(rows) ? rows : []).forEach(r => {
    if (!r?.user_id || r.timer_status !== 'running') return;
    const t = Date.parse(r.updated_at || '');
    if (Number.isFinite(t) && t >= since) ids.add(r.user_id);
  });
  return [...ids];
}
