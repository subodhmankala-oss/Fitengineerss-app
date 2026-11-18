import { useState, useEffect, useMemo } from 'react';
import databaseService from '../services/databaseService';
import { getLocalDateString, shiftLocalDateString } from '../utils/dateUtils';
import { GLANCE_LOOKBACK_DAYS, trainedDatesByClient, clientGlance } from '../utils/clientWeekGlance';
import { summarizeRecentSessions } from '../utils/quietClients';

// Coach client list: fetches the last GLANCE_LOOKBACK_DAYS of workout_logs
// for these clients and returns
//   { glances: { [id]: clientGlance } | null while loading, recaps }.
// A result is only used for the exact client list it was fetched for: the
// list first renders empty, and reusing that empty result for the real
// clients made everyone "30+ days since last workout" until the fetch landed.
// A failed fetch shows no glance at all — never "no workouts" (all red).
// recaps feed the WhatsApp check-in text (same as CoachQuietClients).
// breaksByClient: { [client id]: breaks } ("Taking a break"), optional.
export function useClientWeekGlance(clients, breaksByClient = null) {
  const [fetched, setFetched] = useState(null); // { rows, today, now }
  const idsKey = clients.map(c => c.id).sort().join(',');
  useEffect(() => {
    let cancelled = false;
    const done = (rows, failed = false) => {
      if (!cancelled) setFetched({ key: idsKey, rows: rows || [], failed, today: getLocalDateString(), now: Date.now() });
    };
    if (!idsKey) { done([]); return () => { cancelled = true; }; }
    const since = shiftLocalDateString(getLocalDateString(), -(GLANCE_LOOKBACK_DAYS - 1));
    databaseService.getRecentWorkoutRowsForClients(idsKey.split(','), since)
      .then(rows => done(rows, rows === null))
      .catch(() => done([], true));
    return () => { cancelled = true; };
  }, [idsKey]);

  const byClient = useMemo(() => fetched && {
    dates: trainedDatesByClient(fetched.rows),
    recaps: summarizeRecentSessions(fetched.rows),
  }, [fetched]);

  // One cheap pass per client, so recomputed per render — keeps paused /
  // joined changes on the client objects current without refetching.
  // Still loading this client list (or holding a result for an older one).
  if (!byClient || fetched.key !== idsKey) return { glances: null, recaps: {} };
  // Fetch failed: no glance per client (rows show no dots), nobody "needs you".
  if (fetched.failed) return { glances: {}, recaps: {} };
  const glances = {};
  clients.forEach(c => { glances[c.id] = clientGlance(c, byClient.dates[c.id], fetched.today, fetched.now, breaksByClient?.[c.id] || []); });
  return { glances, recaps: byClient.recaps };
}
