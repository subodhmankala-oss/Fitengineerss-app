import { useState, useEffect } from 'react';
import databaseService from '../services/databaseService';

// How often the coach's client list re-checks who is training. A session
// lasts ~an hour, so a minute's lag on the pulse starting/stopping is fine.
export const LIVE_POLL_MS = 60 * 1000;

// Set of client ids training right now (see api/_liveClients.js), refreshed
// every LIVE_POLL_MS while the page is visible and straight away when the
// coach comes back to it. Pass null to switch it off (empty set).
export function useLiveClientIds(coachId) {
  const [ids, setIds] = useState(() => new Set());

  useEffect(() => {
    if (!coachId) return undefined;
    let cancelled = false;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      databaseService.getCoachLiveClientIds(coachId).then(list => {
        if (cancelled) return;
        setIds(prev => {
          const next = new Set(list);
          // Same members → keep the old Set so the list doesn't re-render.
          return next.size === prev.size && [...next].every(id => prev.has(id)) ? prev : next;
        });
      });
    };
    load();
    const timer = setInterval(load, LIVE_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [coachId]);

  return coachId ? ids : EMPTY;
}

const EMPTY = new Set();
