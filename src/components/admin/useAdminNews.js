import { useCallback, useEffect, useState } from 'react';
import { getAdminNews } from '../../services/databaseService';

// Shared loader for the founder's daily news (NewsRail + the mobile News tab
// badge), so the dashboard makes one request however many places show it.
// The server caches the day's news (api/_adminNews.js); this only dedupes
// within a page load.

let shared = null;

export function loadAdminNews(force = false) {
  if (force || !shared) {
    shared = getAdminNews({ force }).catch((e) => {
      shared = null;
      throw e;
    });
  }
  return shared;
}

export function resetAdminNewsCache() {
  shared = null;
}

export function useAdminNews() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError('');
    try {
      setData(await loadAdminNews(force));
    } catch (e) {
      console.warn('admin news load failed:', e?.message || e);
      setError("Couldn't load today's news.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);
  return { data, error, loading, load };
}

// ─── Unread count for the News tab bubble ───
// Stories are keyed by link (their ids restart at n0 every day). Opening the
// news anywhere marks today's links seen; a new day's links count as unread.

const SEEN_KEY = 'adminNewsSeenLinks';
const SEEN_EVENT = 'admin-news-seen';

function readSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function markNewsSeen(items) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify((items || []).map((i) => i.link)));
  } catch { /* storage blocked — the bubble just stays */ }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

export function useUnreadNewsCount() {
  const { data } = useAdminNews();
  const [seen, setSeen] = useState(readSeen);
  useEffect(() => {
    const refresh = () => setSeen(readSeen());
    window.addEventListener(SEEN_EVENT, refresh);
    return () => window.removeEventListener(SEEN_EVENT, refresh);
  }, []);
  return (data?.items || []).filter((i) => !seen.has(i.link)).length;
}
