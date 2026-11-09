import { useEffect, useState } from 'react';
import { getWorkoutLeftovers, syncWorkoutLeftovers, LEFTOVERS_CHANGED_EVENT } from './workoutLeftovers';

// The carried-over exercises for one client (see workoutLeftovers.js),
// refreshed from the server whenever `active` turns on (the logger opens),
// the client changes, or the app comes back to the foreground. Re-renders on
// any add/dismiss/save, from this screen or another.
export default function useWorkoutLeftovers(ownerId, active = true) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const onChange = (e) => {
      if (!e?.detail?.ownerId || e.detail.ownerId === ownerId) setTick(t => t + 1);
    };
    window.addEventListener(LEFTOVERS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LEFTOVERS_CHANGED_EVENT, onChange);
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId || !active) return undefined;
    syncWorkoutLeftovers(ownerId);
    const onVisible = () => { if (document.visibilityState === 'visible') syncWorkoutLeftovers(ownerId); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [ownerId, active]);

  return ownerId ? getWorkoutLeftovers(ownerId) : [];
}
