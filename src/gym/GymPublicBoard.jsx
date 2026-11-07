import { useMemo } from 'react';
import databaseService from '../services/databaseService';
import GymLive from './GymLive';
import './gym.css';

// The shareable Live board (/gym/board/<token>): no login, read-only. The token
// in the link is the only key; the server sends short names and no emails or
// real ids.
export default function GymPublicBoard({ service = databaseService, token }) {
  const boardToken = token ?? window.location.pathname.split('/').filter(Boolean)[2];
  const source = useMemo(() => ({
    getGymLive: ({ light }) => service.getPublicGymLive(boardToken, { light })
  }), [service, boardToken]);

  return (
    <div className="gym-app">
      <div className="gx-public">
        <GymLive service={source} publicView />
      </div>
    </div>
  );
}
