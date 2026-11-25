import { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';

/**
 * What is SAVED about a client's level: { profile, pref }, or null until
 * loaded. Pass it to trainingLevelFor (utils/clientTrainingLevel) with the
 * client's logs for the level their muscle targets follow.
 * @param {string|null} userId - public.users.id of the client
 */
export default function useClientTrainingLevel(userId) {
  const [result, setResult] = useState({ userId: null, saved: null });

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    // A failed or missing read just means no level saved.
    const safe = fn => Promise.resolve().then(() => fn?.(userId)).catch(() => null);
    Promise.all([
      safe(databaseService.getClientTrainingProfile?.bind(databaseService)),
      safe(databaseService.getLibraryLevelPref?.bind(databaseService)),
    ]).then(([profile, pref]) => {
      if (!cancelled) setResult({ userId, saved: { profile, pref } });
    });
    return () => { cancelled = true; };
  }, [userId]);

  // A level loaded for the previous client never leaks onto the next one.
  return result.userId === userId ? result.saved : null;
}
