import { useCallback, useEffect, useState } from 'react';
import databaseService, { recoverStoredSession } from '../services/databaseService';
import GymApp from './GymApp';
import GymLogin from './GymLogin';
import './gym.css';

// The gym owner's own site (/gym): its own login page, no coach/client tabs,
// no sign-up. Same Supabase project and API as the coach app, but nothing here
// routes through App.jsx, so a gym owner never lands in the coach/client app
// from this URL.
//
// `service` / `restore` are injectable for tests.
export default function GymPortal({ service = databaseService, restore = recoverStoredSession }) {
  // 'checking' → looking for a saved session; 'login'; 'denied' → signed in
  // but the account owns no gym; 'ready'.
  const [stage, setStage] = useState('checking');
  const [error, setError] = useState('');
  const [gymData, setGymData] = useState(null);
  const [biz, setBiz] = useState({ data: null, error: '' });

  const checkOwnership = useCallback(async () => {
    const [result, money] = await Promise.all([service.getOwnerGym(), service.getGymBusiness()]);
    if (!result.success) {
      setError(result.error || 'Could not load your gym.');
      setStage('login');
    } else if (!result.gym) {
      setStage('denied');
    } else {
      setError('');
      setGymData(result);
      setBiz(money.success ? { data: money, error: '' } : { data: null, error: money.error });
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

  let body;
  if (stage === 'checking') {
    body = <div className="gym-shell gym-center"><p className="gym-muted">Loading…</p></div>;
  } else if (stage === 'ready') {
    body = <GymApp data={gymData} biz={biz.data} bizError={biz.error} service={service} onReload={checkOwnership} onSignOut={signOut} />;
  } else if (stage === 'denied') {
    body = (
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
  } else {
    body = <GymLogin service={service} initialError={error} onSignedIn={checkOwnership} />;
  }

  return <div className="gym-app">{body}</div>;
}
