import React, { useState } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Gmail-scanner protection:
//   Email link → our SPA (/auth/confirm). Gmail GET gets HTML, no JS runs, token safe.
//   On button click → POST to our Vercel API (server-side) to verify the token_hash.
//   Server calls Supabase /auth/v1/verify (no browser CORS/SDK-hang issues).
//   Returns access_token → client uses it for a raw PUT to update the password.

const panelWrap = {
  display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px',
  background: 'radial-gradient(circle at top right, rgba(139,92,246,0.15), transparent 40%), radial-gradient(circle at bottom left, rgba(109,40,217,0.15), transparent 40%), #030712'
};
const card = {
  maxWidth: '420px', width: '100%', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '32px 28px', textAlign: 'center'
};

const AuthConfirm = () => {
  const params = new URLSearchParams(window.location.search);
  const token_hash = params.get('token_hash');
  const type = params.get('type');
  const isValid = !!(token_hash && type);

  // status: idle | verifying | password | saving | success | error
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleVerify = async () => {
    setStatus('verifying');
    setErrorMsg('');
    try {
      const resp = await fetch('/api/verify-recovery-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_hash, type })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Link is invalid or has expired.');
      if (type === 'recovery') {
        setAccessToken(data.access_token);
        setStatus('password');
      } else {
        // Email confirmation — token verified, send to app
        setStatus('success');
        setTimeout(() => { window.location.href = window.location.origin; }, 1500);
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'This link is invalid or has expired. Please request a new one.');
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) { setErrorMsg('Password must be at least 6 characters.'); return; }
    setStatus('saving');
    setErrorMsg('');
    try {
      const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ password: newPassword })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.msg || data.error_description || data.error || 'Failed to update password.');

      // Sign out the recovery session so the app redirects to login, not the wizard
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${accessToken}` }
      }).catch(() => {});
      localStorage.clear();

      setStatus('success');
      setTimeout(() => { window.location.href = window.location.origin; }, 1500);
    } catch (err) {
      setStatus('password'); // revert so user can retry
      setErrorMsg(err.message || 'Could not update password. Please try again.');
    }
  };

  const goToLogin = () => { window.location.href = window.location.origin; };

  return (
    <div className="app-container" style={panelWrap}>
      <div style={card}>

        {/* Invalid link — missing params */}
        {!isValid && (
          <>
            <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>⚠️</div>
            <h2 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>Invalid link</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>This link is missing required details. Please request a new email.</p>
            <button onClick={goToLogin} style={btnGreen}>Back to login</button>
          </>
        )}

        {/* Idle — show action button */}
        {isValid && status === 'idle' && (
          <>
            <div style={{ fontSize: '2.4rem', marginBottom: '14px' }}>🔒</div>
            <h2 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px' }}>
              {type === 'recovery' ? 'Reset your password' : 'Confirm your email'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '24px' }}>
              {type === 'recovery'
                ? 'Click below to verify your link and set a new password.'
                : 'Click below to confirm your email address.'}
            </p>
            <button onClick={handleVerify} style={btnPurple}>
              {type === 'recovery' ? 'Reset Password' : 'Confirm Email'}
            </button>
          </>
        )}

        {/* Verifying */}
        {status === 'verifying' && (
          <>
            <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>⏳</div>
            <h2 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>Verifying…</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>One moment.</p>
          </>
        )}

        {/* Password form */}
        {status === 'password' && (
          <>
            <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>🔒</div>
            <h2 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 800, marginBottom: '12px' }}>Set a new password</h2>
            {errorMsg && <div style={errBox}>{errorMsg}</div>}
            <form onSubmit={handleSetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="password"
                placeholder="New password (min 6 characters)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoFocus
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '11px 12px', color: '#fff', fontSize: '16px', outline: 'none' }}
              />
              <button type="submit" style={btnPurple}>Update password</button>
            </form>
          </>
        )}

        {/* Saving */}
        {status === 'saving' && (
          <>
            <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>⏳</div>
            <h2 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>Saving…</h2>
          </>
        )}

        {/* Success */}
        {status === 'success' && (
          <>
            <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>✅</div>
            <h2 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 800, marginBottom: '8px' }}>All set!</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Taking you to the app…</p>
          </>
        )}

        {/* Error */}
        {status === 'error' && (
          <>
            <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>❌</div>
            <h2 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, marginBottom: '12px' }}>This link didn't work</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '20px' }}>{errorMsg}</p>
            <button onClick={goToLogin} style={btnGreen}>Back to login</button>
          </>
        )}

      </div>
    </div>
  );
};

const btnPurple = { width: '100%', padding: '13px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' };
const btnGreen  = { width: '100%', padding: '12px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' };
const errBox    = { padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.8rem', marginBottom: '10px' };

export default AuthConfirm;
