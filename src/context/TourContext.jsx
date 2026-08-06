import { createContext, useCallback, useContext, useState } from 'react';

// Drives the client "spotlight" walkthrough: a step number that real app
// navigation (bottom-nav clicks, tab switches inside WorkoutTracker, etc.)
// advances as the user actually interacts with the highlighted control, plus
// a couple of steps that are purely informational and advance via a manual
// "Next" button in the tooltip. See TourOverlay.jsx for the step script.
//
// step === 0 means the tour is inactive/not showing.
const TourContext = createContext(null);

const STORAGE_KEY = 'clientTourSeen';

export function TourProvider({ children }) {
  const [step, setStep] = useState(0);

  // Begin the tour, but only if this account hasn't already dismissed it.
  const start = useCallback(() => {
    if (localStorage.getItem(STORAGE_KEY) === 'true') return;
    setStep((s) => (s === 0 ? 1 : s));
  }, []);

  // Force-restart regardless of the "seen" flag — used by the replay button.
  const restart = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setStep(1);
  }, []);

  // Move from step `from` to step `to`, but only if the tour is currently
  // sitting on `from` — makes it safe to call this from effects that watch
  // app state without worrying about clobbering an unrelated step.
  const advanceIfStep = useCallback((from, to) => {
    setStep((s) => (s === from ? to : s));
  }, []);

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setStep(0);
  }, []);

  return (
    <TourContext.Provider value={{ step, start, restart, advanceIfStep, finish }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
}
