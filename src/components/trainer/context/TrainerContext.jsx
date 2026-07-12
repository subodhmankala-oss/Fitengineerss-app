import React, { createContext, useContext } from 'react';
import { useTrainerData } from '../hooks/useTrainerData';

const TrainerContext = createContext(null);

export function TrainerProvider({ children, loggedInEmail, userRole, handleLogout }) {
  const trainerData = useTrainerData({ loggedInEmail, userRole, handleLogout });
  return (
    <TrainerContext.Provider value={trainerData}>
      {children}
    </TrainerContext.Provider>
  );
}

export function useTrainer() {
  const context = useContext(TrainerContext);
  if (!context) {
    throw new Error('useTrainer must be used within a TrainerProvider');
  }
  return context;
}
