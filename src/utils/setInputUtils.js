// Shared state for the custom on-screen number pad (see
// components/SetNumberPad.jsx) that replaces the phone's native keyboard for
// the weight/reps/km/time fields in the set-logging tables. WorkoutTracker's
// client view and TrainerDashboard's coach Live Log tab both render the same
// "hevy-set-row" markup and both need one of these, so it's shared here.
//
// We stopped relying on real <input> elements + the native mobile keyboard
// for these fields entirely: no amount of CSS/JS can suppress or smooth out
// the OS's own keyboard-accessory bar (the strip with prev/next arrows
// Android/iOS glue above their virtual keyboard) from the web page side, so
// the only way to actually own the animation and get rid of that bar is to
// stop opening the native keyboard in the first place.
//
// activeKey (state) tracks WHICH field is open, not its descriptor —
// descriptors (value/onValue/onNext/...) are rebuilt fresh on every render
// of each row and pushed into `registry` via registerField() as a plain
// side effect during render. Reading the registry only at the very end of
// the tree (getActiveField, called when mounting <SetNumberPad>) is what
// keeps the pad's value live: it always sees the current render's value,
// never a snapshot frozen from whenever the field was first opened.
import { useCallback, useRef, useState } from 'react';

export function useSetNumberPad() {
  const [activeKey, setActiveKey] = useState(null);
  const registry = useRef({});

  const registerField = useCallback((key, descriptor) => {
    registry.current[key] = descriptor;
  }, []);

  const openField = useCallback((key) => {
    setActiveKey(key);
  }, []);

  const closeField = useCallback(() => {
    setActiveKey(null);
  }, []);

  const getActiveField = useCallback(() => (
    activeKey ? registry.current[activeKey] : null
  ), [activeKey]);

  return { activeKey, registerField, openField, closeField, getActiveField };
}
