import { createContext, useContext } from 'react';

// Which body figure (male/female) the muscle drawings — heat map, muscle
// icons, plan-card icons, the Add Exercise body filter — should show.
//
// Coach screens provide the selected client's profile sex (TrainerDashboard),
// so a coach sees each client's own figure. With no provider (the client's
// own app) it falls back to the signed-in client's profile sex. Anything
// other than 'female' draws the male figure.
export const BodySexContext = createContext(undefined);

export function useBodySex() {
  const provided = useContext(BodySexContext);
  if (provided !== undefined) return provided;
  try {
    const role = localStorage.getItem('userRole');
    if (role && role !== 'client') return null;
    return localStorage.getItem('userSex');
  } catch {
    return null;
  }
}
