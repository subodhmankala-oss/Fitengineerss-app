import { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';

const CATEGORIES = ['gym', 'home'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];

// The whole Workout Library ({ gym: { beginner: [...], ... }, home: {...} }),
// loaded once per mount — same shape NextWorkoutBanner builds and
// determineWorkoutGuidance reads. null while loading. A list that fails to
// load comes back empty rather than failing the rest.
export default function useWorkoutLibrary() {
  const [library, setLibrary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(CATEGORIES.map(category =>
      Promise.all(LEVELS.map(level =>
        databaseService.getGenericWorkoutsByLevel(level, category).catch(() => [])
      ))
    )).then(([gym, home]) => {
      if (cancelled) return;
      const shape = lists => Object.fromEntries(LEVELS.map((l, i) => [l, lists[i] || []]));
      setLibrary({ gym: shape(gym), home: shape(home) });
    });
    return () => { cancelled = true; };
  }, []);

  return library;
}
