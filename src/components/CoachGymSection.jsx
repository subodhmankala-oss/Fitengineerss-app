import { useCallback, useEffect, useState } from 'react';
import databaseService from '../services/databaseService';

// Body of the coach profile's "My Gym" page (CoachProfile.jsx): join a gym
// with its code, or see / leave the gym you're in. No approval — a valid code
// joins instantly (sql/gym_coach_join_leave.sql). Existing clients only come
// along if the trainer ticks the box (default off), so their private clients
// never become visible to a gym owner without that choice. `service` is
// injectable for tests; onMembershipChange lets the dashboard refresh.

const errorBox = {
  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
  borderRadius: 10, padding: '10px 14px', marginBottom: 12,
  color: '#f87171', fontSize: '0.85rem', fontWeight: 700
};
const okBox = {
  background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)',
  borderRadius: 10, padding: '10px 14px', marginBottom: 12,
  color: '#10b981', fontSize: '0.85rem', fontWeight: 700
};
const primaryButton = {
  width: '100%', padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, #4364bd, #3552a3)', color: '#fff',
  fontSize: '0.88rem', fontWeight: 800, fontFamily: 'inherit'
};
const hint = { fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.45 };

export default function CoachGymSection({ service = databaseService, onMembershipChange }) {
  const [state, setState] = useState({ loading: true, gym: null, clientsOutsideGym: 0, error: '' });
  const [code, setCode] = useState('');
  const [bringClients, setBringClients] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);

  const apply = useCallback((r) => {
    setState(r.success
      ? { loading: false, gym: r.gym, clientsOutsideGym: r.clientsOutsideGym, error: '' }
      : { loading: false, gym: null, clientsOutsideGym: 0, error: r.error });
  }, []);

  useEffect(() => {
    let cancelled = false;
    service.getCoachGym().then((r) => { if (!cancelled) apply(r); });
    return () => { cancelled = true; };
  }, [service, apply]);

  const reload = async () => apply(await service.getCoachGym());

  const handleJoin = async (e) => {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setActionError('');
    setNotice('');
    const r = await service.coachJoinGym(code, bringClients);
    setBusy(false);
    if (!r.success) {
      setActionError(r.error);
      return;
    }
    const moved = r.clients_moved || 0;
    setNotice(`You joined ${r.gym_name}.${moved ? ` ${moved} of your client${moved === 1 ? '' : 's'} moved in with you.` : ''}`);
    setCode('');
    setBringClients(false);
    await reload();
    onMembershipChange?.();
  };

  const handleBringNow = async () => {
    setBusy(true);
    setActionError('');
    setNotice('');
    // Re-joining the same gym with bringClients only moves the clients.
    const r = await service.coachJoinGym(state.gym.code || '', true);
    setBusy(false);
    if (!r.success) { setActionError(r.error); return; }
    setNotice(`${r.clients_moved || 0} client${r.clients_moved === 1 ? '' : 's'} added to ${r.gym_name}.`);
    await reload();
    onMembershipChange?.();
  };

  const handleLeave = async () => {
    setBusy(true);
    setActionError('');
    setNotice('');
    const r = await service.coachLeaveGym();
    setBusy(false);
    setConfirmLeave(false);
    if (!r.success) { setActionError(r.error); return; }
    setNotice(`You left ${r.gym_name}.`);
    await reload();
    onMembershipChange?.();
  };

  if (state.loading) {
    return <div style={{ ...hint, padding: '24px 4px' }}>Loading…</div>;
  }

  return (
    <div>
      {notice && <div role="status" style={okBox}>✓ {notice}</div>}
      {(actionError || state.error) && <div role="alert" style={errorBox}>✕ {actionError || state.error}</div>}

      {state.gym ? (
        <>
          <div className="cp-form-section-label">Your gym</div>
          <div className="cp-form-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>🏢 {state.gym.name}</div>
            {state.gym.code && <div style={{ ...hint, marginTop: 2 }}>Gym code: <strong>{state.gym.code}</strong></div>}
            <div style={{ ...hint, marginTop: 4 }}>
              {state.gym.isOwner
                ? 'You own this gym. Manage it from My Gym on your dashboard.'
                : state.gym.status === 'active'
                  ? 'New clients who join you are added to this gym. The gym owner can see your clients’ training activity — never your private notes or photos.'
                  : 'This gym is suspended right now.'}
            </div>
          </div>

          {!state.gym.isOwner && (
            <>
              {state.clientsOutsideGym > 0 && state.gym.status === 'active' && (
                <div className="cp-form-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, ...hint }}>
                    {state.clientsOutsideGym} of your clients {state.clientsOutsideGym === 1 ? 'isn’t' : 'aren’t'} in this gym yet.
                  </div>
                  <button type="button" onClick={handleBringNow} disabled={busy}
                    style={{ ...primaryButton, width: 'auto', padding: '8px 14px', fontSize: '0.78rem' }}>
                    Add them
                  </button>
                </div>
              )}

              {confirmLeave ? (
                <div className="cp-form-card" style={{ padding: '14px 16px' }}>
                  <div style={{ ...hint, marginBottom: 10 }}>
                    Leave {state.gym.name}? Your clients in this gym leave with you and stay your clients.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={handleLeave} disabled={busy}
                      style={{ ...primaryButton, background: '#dc2626' }}>
                      {busy ? 'Leaving…' : 'Leave gym'}
                    </button>
                    <button type="button" onClick={() => setConfirmLeave(false)} disabled={busy}
                      style={{ ...primaryButton, background: 'rgba(var(--fg-rgb), 0.08)', color: 'var(--text-main)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmLeave(true)}
                  style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', padding: '6px 4px', fontFamily: 'inherit' }}>
                  Leave this gym
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <form onSubmit={handleJoin}>
          <div className="cp-form-section-label">Join a gym</div>
          <div className="cp-form-card">
            <div className="cp-field cp-field--last">
              <label className="cp-field-label" htmlFor="coach-gym-code">Gym code</label>
              <input
                id="coach-gym-code"
                className="cp-field-input"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setActionError(''); }}
                placeholder="GYM-XXXX"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={20}
              />
            </div>
          </div>
          <p style={{ ...hint, margin: '-4px 4px 12px' }}>Ask your gym owner for the code.</p>

          {state.clientsOutsideGym > 0 && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '0 4px 14px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={bringClients}
                onChange={(e) => setBringClients(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: '#4364bd' }}
              />
              <span style={hint}>
                Also add my {state.clientsOutsideGym} current client{state.clientsOutsideGym === 1 ? '' : 's'} to this gym.
                {' '}Leave this off to keep them private — only clients who join you from now on are added.
              </span>
            </label>
          )}

          <button type="submit" disabled={busy || !code.trim()} style={{ ...primaryButton, opacity: busy || !code.trim() ? 0.55 : 1 }}>
            {busy ? 'Joining…' : 'Join gym'}
          </button>
        </form>
      )}
    </div>
  );
}
