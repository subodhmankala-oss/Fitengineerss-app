// Body-measurement cadence, shared by the client's Measurements screen and
// the coach's "measurement due" bell items. Same 15 days the client's save
// lock and api/push.js's reminder sweep use.
export const MEAS_INTERVAL_DAYS = 15;

const DAY_MS = 86_400_000;

// Which of a coach's clients are due a measurement check-in today.
// clients: dashboard client objects ({ id, userName, joined_at, paused_at }).
// lastMeasuredAt: { [userId]: ISO timestamp of their newest entry }.
// A client who has never logged one is anchored to when they joined, so a
// brand-new invite isn't flagged on day one. Longest-overdue first.
export function getMeasurementDueClients(clients = [], lastMeasuredAt = {}, now = Date.now()) {
  return clients
    .filter(c => c && c.id && !c.paused_at)
    .map(c => {
      const last = lastMeasuredAt[c.id] || null;
      const anchor = last || c.joined_at || null;
      if (!anchor) return null;
      const t = Date.parse(anchor);
      if (!Number.isFinite(t)) return null;
      const daysSince = Math.floor((now - t) / DAY_MS);
      if (daysSince < MEAS_INTERVAL_DAYS) return null;
      return {
        clientId: c.id,
        clientName: c.userName || 'Client',
        lastMeasuredAt: last,
        daysSince,
        // When it fell due — the bell sorts on this.
        dueAt: new Date(t + MEAS_INTERVAL_DAYS * DAY_MS).toISOString()
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.daysSince - a.daysSince);
}

// Per-field change between two entries' measurement maps:
// [{ key, from, to, delta }] for fields filled in both and actually changed.
export function measurementChanges(newer = {}, older = {}, keys = null) {
  const fields = keys || Object.keys(newer || {});
  const out = [];
  fields.forEach(key => {
    const to = parseFloat(newer?.[key]);
    const from = parseFloat(older?.[key]);
    if (!Number.isFinite(to) || !Number.isFinite(from)) return;
    const delta = +(to - from).toFixed(1);
    if (Math.abs(delta) < 0.05) return;
    out.push({ key, from, to, delta });
  });
  return out;
}
