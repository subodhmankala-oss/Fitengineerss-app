import React, { useState, useEffect } from 'react';
import { supabase } from '../services/databaseService';

// Handles the PKCE / token_hash email-link flow:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup|recovery|...
// The one-time token is only consumed when THIS code calls verifyOtp(), i.e. when a
// real browser runs the JS — not on the plain GET that Gmail's link scanner performs.
// That's what stops links from being "used up" before the human clicks them.
const panelWrap = {
  display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px',
  background: 'radial-gradient(circle at top right, rgba(139, 92, 246, 0.15), transparent 40%), radial-gradient(circle at bottom left, rgba(109, 40, 217, 0.15), transparent 40%), #030712'
};
const card = {
  maxWidth: '420px', width: '100%', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '32px 28px', textAlign: 'center'
};

const AuthConfirm = () => {
  // status: verifying | recovery | success | error
  const [status, setStatus] = useState('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token_hash = params.get('token_hash');
    const type = params.get('type');

    if (!token_hash || !type) {
      setStatus('error');
      setErrorMsg('This link is missing its verification details. Please request a new email.');
      return;
    }

    const timeout = setTimeout(() => {
      setStatus('error');
      setErrorMsg('Verification timed out. Please request a new link.');
    }, 10000);

    (async () => {
      try {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        clearTimeout(timeout);
        if (error) {
          setStatus('error');
          setErrorMsg(error.message || 'This link is invalid or has expired. Please request a new one.');
          return;
        }
        if (type === 'recovery') {
          setStatus('recovery');
        } else {
          setStatus('success');
          setTimeout(() => { window.location.href = window.location.origin; }, 1200);
        }
      } catch (err) {
        clearTimeout(timeout);
        setStatus('error');
        setErrorMsg(err.message || 'Something went wrong. Please request a new link.');
      }
    })();
  }, []);

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setStatus('success');
      setTimeout(() => { window.location.href = window.location.origin; }, 1200);
    } catch (err) {
      setErrorMsg(err.message || 'Could not update password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const goToLogin = async () => {
    try { await supabase.auth.signOut(); } catch (e) { /* */ }
    localStorage.clear();
    window.location.href = window.location.origin;
  };

  return (
    <div className="app-container" style={panelWrap}>
      <div style={card}>
        {status === 'verifying' && (
          <>
            <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>⏳</div>
            <h2 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 800, marginBottom: '8px' }}>Verifying your link…</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>One moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>✅</div>
            <h2 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 800, marginBottom: '8px' }}>All set!</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Taking you into the app…</p>
          </>
        )}

        {status === 'recovery' && (
          <>
            <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>🔒</div>
            <h2 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 800, marginBottom: '12px' }}>Set a new password</h2>
            {errorMsg && (
              <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.8rem', marginBottom: '14px' }}>{errorMsg}</div>
            )}
            <form onSubmit={handleSetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="password"
                placeholder="New password (min 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '11px 12px', color: '#fff', fontSize: '16px', outline: 'none' }}
              />
              <button type="submit" disabled={saving} style={{ padding: '12px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Update password'}
              </button>
            </form>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>⏳</div>
            <h2 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 800, marginBottom: '12px' }}>This link didn’t work</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '20px' }}>{errorMsg}</p>
            <button onClick={goToLogin} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
              Back to login
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthConfirm;
