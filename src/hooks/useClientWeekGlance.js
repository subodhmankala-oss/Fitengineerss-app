import { useState, useEffect, useMemo } from 'react';
import databaseService from '../services/databaseService';
import { getLocalDateString, shiftLocalDateString } from '../utils/dateUtils';
import { GLANCE_LOOKBACK_DAYS, trainedDatesByClient, clientGlance } from '../utils/clientWeekGlance';
import { summarizeRecentSessions } from '../utils/quietClients';

// Coach client list: fetches the last GLANCE_LOOKBACK_DAYS of workout_logs
// for these clients and returns
//   { glances: { [id]: clientGlance } | null while loading, recaps }.
// recaps feed the WhatsApp check-in text (same as CoachQuietClients).
export function useClientWeekGlance(clients) {
  const [fetched, setFetched] = useState(null); // { rows, today, now }
  const idsKey = clients.map(c => c.id).sort().join(',');
  useEffect(() => {
    let cancelled = false;
    const done = rows => { if (!cancelled) setFetched({ rows: rows || [], today: getLocalDateString(), now: Date.now() }); };
    if (!idsKey) { done([]); return () => { cancelled = true; }; }
    const since = shiftLocalDateString(getLocalDateString(), -(GLANCE_LOOKBACK_DAYS - 1));
    databaseService.getRecentWorkoutRowsForClients(idsKey.split(','), since)
      .then(done)
      .catch(() => done([]));
    return () => { cancelled = true; };
  }, [idsKey]);

  const byClient = useMemo(() => fetched && {
    dates: trainedDatesByClient(fetched.rows),
    recaps: summarizeRecentSessions(fetched.rows),
  }, [fetched]);

  // One cheap pass per client, so recomputed per render — keeps paused /
  // joined changes on the client objects current without refetching.
  if (!byClient) return { glances: null, recaps: {} };
  const glances = {};
  clients.forEach(c => { glances[c.id] = clientGlance(c, byClient.dates[c.id], fetched.today, fetched.now); });
  return { glances, recaps: byClient.recaps };
}
