import { useCallback, useEffect, useState } from 'react';
import databaseService, { recoverStoredSession } from '../services/databaseService';
import OwnerGymDashboard from '../components/OwnerGymDashboard';
import GymLogin from './GymLogin';
import './gym.css';

// The gym owner's own site (/gym): its own login page, no coach/client tabs,
// no sign-up. Same Supabase project and API as the coach app — the dashboard
// is the same OwnerGymDashboard — but nothing here routes through App.jsx, so
// a gym owner never sees (or lands in) the coach/client app from this URL.
//
// `service` / `restore` are injectable for tests.
export default function GymPortal({ service = databaseService, restore = recoverStoredSession }) {
  // 'checking' → looking for a saved session; 'login'; 'denied' → signed in
  // but the account owns no gym; 'ready'.
  const [stage, setStage] = useState('checking');
  const [error, setError] = useState('');

  const checkOwnership = useCallback(async () => {
    const result = await service.getOwnerGym();
    if (!result.success) {
      setError(result.error || 'Could not load your gym.');
      setStage('login');
    } else if (!result.gym) {
      setStage('denied');
    } else {
      setError('');
      setStage('ready');
    }
  }, [service]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let session = null;
      try { session = await restore(); } catch { /* treated as signed out */ }
      if (cancelled) return;
      if (!session) { setStage('login'); return; }
      await checkOwnership();
    })();
    return () => { cancelled = true; };
  }, [restore, checkOwnership]);

  const signOut = async () => {
    try { await service.signOut(); } catch { /* the stored session is cleared first either way */ }
    setError('');
    setStage('login');
  };

  if (stage === 'checking') {
    return <div className="gym-shell gym-center"><p className="gym-muted">Loading…</p></div>;
  }

  if (stage === 'ready') {
    return (
      <div className="gym-shell">
        <div className="gym-topbar">
          <span className="gym-brand">Fitengineers <b>Gym</b></span>
          <button type="button" className="gym-link" onClick={signOut}>Sign out</button>
        </div>
        <div className="gym-scroll">
          <OwnerGymDashboard service={service} />
        </div>
      </div>
    );
  }

  if (stage === 'denied') {
    return (
      <div className="gym-shell gym-center">
        <div className="gym-card">
          <h1 className="gym-title">No gym on this account</h1>
          <p className="gym-muted">
            This login isn’t set up as a gym owner. Coaches and clients sign in on the main Fitengineers app.
          </p>
          <button type="button" className="gym-btn" onClick={signOut}>Use a different account</button>
        </div>
      </div>
    );
  }

  return (
    <GymLogin
      service={service}
      initialError={error}
      onSignedIn={checkOwnership}
    />
  );
}
