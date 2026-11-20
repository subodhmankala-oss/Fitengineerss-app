import { useCallback, useEffect, useState } from 'react';

// Workout full-screen for the set logger (client WorkoutTracker + coach Live
// Log). Ticking a set hides the screen's top tabs and the app's bottom navbar
// so the whole workout — every exercise, Save, everything — gets the room.
// The floating down arrow (WorkoutFullScreenExit) brings them back; the next
// tick goes full-screen again.
//
// The bottom navbar lives in App.jsx, so it's hidden through a body class
// (see WorkoutFullScreenExit.css) rather than a prop.
export const FULL_SCREEN_BODY_CLASS = 'workout-full-screen';

export default function useWorkoutFullScreen(enabled = true) {
  const [on, setOn] = useState(false);

  const onSetTicked = useCallback((turningOn) => {
    if (turningOn) setOn(true);
  }, []);
  const exit = useCallback(() => setOn(false), []);

  // Leaving the logger (Save, Discard, another tab) ends full-screen, so the
  // next workout starts with the tabs and navbar back.
  if (!enabled && on) setOn(false);
  const active = on && enabled;

  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    document.body.classList.add(FULL_SCREEN_BODY_CLASS);
    return () => document.body.classList.remove(FULL_SCREEN_BODY_CLASS);
  }, [active]);

  return { active, onSetTicked, exit };
}
