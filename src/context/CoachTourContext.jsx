import { createContext, useCallback, useContext, useState } from 'react';

// Coach-side counterpart to TourContext — same shape, own storage key, own
// step numbering. Kept as a separate context (rather than a `role` flag on
// the client one) because the two scripts point at completely different
// screens and share no steps; see CoachTourOverlay.jsx for the step script.
//
// step === 0 means the tour is inactive/not showing.
const CoachTourContext = createContext(null);

const STORAGE_KEY = 'coachTourSeen';

export function CoachTourProvider({ children }) {
  const [step, setStep] = useState(0);

  // Begin the tour, but only if this coach hasn't already dismissed it.
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
  // sitting on `from` — safe to call from effects that watch app state
  // without worrying about clobbering an unrelated step.
  const advanceIfStep = useCallback((from, to) => {
    setStep((s) => (s === from ? to : s));
  }, []);

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setStep(0);
  }, []);

  return (
    <CoachTourContext.Provider value={{ step, start, restart, advanceIfStep, finish }}>
      {children}
    </CoachTourContext.Provider>
  );
}

export function useCoachTour() {
  const ctx = useContext(CoachTourContext);
  if (!ctx) throw new Error('useCoachTour must be used within a CoachTourProvider');
  return ctx;
}
