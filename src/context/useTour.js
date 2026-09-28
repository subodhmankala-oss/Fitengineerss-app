import { createContext, useContext } from 'react';

export const TourContext = createContext(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
}
