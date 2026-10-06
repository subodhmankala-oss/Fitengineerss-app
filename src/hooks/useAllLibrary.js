import { useEffect, useRef, useState } from 'react';
import databaseService from '../services/databaseService';

const COMBOS = ['gym', 'home'].flatMap(c => ['beginner', 'intermediate', 'advanced'].map(l => [c, l]));

// Loads every Workout Library list (Gym/Home x 3 levels) once, the first time
// `enabled` turns true, and keeps it for the rest of the mount.
//
// Guarded by a ref, not by a loading flag in the effect deps: depending on
// the flag re-ran the effect the moment it was set, and that run's cleanup
// cancelled the in-flight request, leaving "Searching…" on screen forever.
export default function useAllLibrary(enabled) {
  const [entries, setEntries] = useState(null);
  const requested = useRef(false);

  useEffect(() => {
    if (!enabled || requested.current) return;
    requested.current = true;
    // Each list already swallows its own failure, so this always settles.
    Promise.all(COMBOS.map(([category, level]) =>
      databaseService.getGenericWorkoutsByLevel(level, category)
        .then(ws => (ws || []).map(workout => ({ category, level, workout })))
        .catch(() => [])
    )).then(lists => setEntries(lists.flat()));
  }, [enabled]);

  return { entries, loading: enabled && entries === null };
}
