import { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import { resolveClientTrainingLevel } from '../utils/clientTrainingLevel';

/**
 * The experience level a client's muscle targets follow (see
 * utils/clientTrainingLevel). null until loaded, or when the client has no
 * level saved anywhere — the muscle screens then use the intermediate band.
 * @param {string|null} userId - public.users.id of the client
 */
export default function useClientTrainingLevel(userId) {
  const [result, setResult] = useState({ userId: null, level: null });

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    // A failed or missing read just means "no level" (intermediate targets).
    const safe = fn => Promise.resolve().then(() => fn?.(userId)).catch(() => null);
    Promise.all([
      safe(databaseService.getClientTrainingProfile?.bind(databaseService)),
      safe(databaseService.getLibraryLevelPref?.bind(databaseService)),
    ]).then(([profile, pref]) => {
      if (!cancelled) setResult({ userId, level: resolveClientTrainingLevel(profile, pref) });
    });
    return () => { cancelled = true; };
  }, [userId]);

  // A level loaded for the previous client never leaks onto the next one.
  return result.userId === userId ? result.level : null;
}
