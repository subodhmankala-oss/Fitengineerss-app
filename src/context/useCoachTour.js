import { createContext, useContext } from 'react';

export const CoachTourContext = createContext(null);

export function useCoachTour() {
  const ctx = useContext(CoachTourContext);
  if (!ctx) throw new Error('useCoachTour must be used within a CoachTourProvider');
  return ctx;
}
