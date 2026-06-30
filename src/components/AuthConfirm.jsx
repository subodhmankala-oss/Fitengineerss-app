import React from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Gmail link-scanner protection:
// The email points here (our SPA). Gmail does a plain GET → gets HTML, no JS executed.
// The Supabase verify URL is only constructed when the user CLICKS the button,
// so Gmail never sees it and cannot consume the one-time token.
const panelWrap = {
  display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px',
  background: 'radial-gradient(circle at top right, rgba(139, 92, 246, 0.15), transparent 40%), radial-gradient(circle at bottom left, rgba(109, 40, 217, 0.15), transparent 40%), #030712'
};
const card = {
  maxWidth: '420px', width: '100%', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '32px 28px', textAlign: 'center'
};

const AuthConfirm = () => {
  const params = new URLSearchParams(window.location.search);
  // Support both {{ .Token }} (GET flow) and {{ .TokenHash }} (legacy)
  const token = params.get('token') || params.get('token_hash');
  const type = params.get('type');

  const isValid = !!(token && type);

  const handleContinue = () => {
    if (!isValid) return;
    // GET /auth/v1/verify with `token` param — Supabase processes and redirects back.
    // redirect_to brings us back to app root so onAuthStateChange fires
    // (PASSWORD_RECOVERY event → shows reset-password modal).
    const redirectTo = window.location.origin;
    const url = `${SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(redirectTo)}`;
    window.location.href = url;
  };

  return (
    <div className="app-container" style={panelWrap}>
      <div style={card}>
        {isValid ? (
          <>
            <div style={{ fontSize: '2.4rem', marginBottom: '14px' }}>🔒</div>
            <h2 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 800, marginBottom: '8px' }}>
              {type === 'recovery' ? 'Reset your password' : 'Confirm your email'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '24px' }}>
              {type === 'recovery'
                ? 'Click the button below to set a new password for your account.'
                : 'Click the button below to confirm your email address.'}
            </p>
            <button
              onClick={handleContinue}
              style={{ width: '100%', padding: '13px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}
            >
              {type === 'recovery' ? 'Reset Password' : 'Confirm Email'}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: '2.4rem', marginBottom: '14px' }}>⚠️</div>
            <h2 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>Invalid link</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '20px' }}>
              This link is missing required details. Please request a new email.
            </p>
            <button
              onClick={() => { window.location.href = window.location.origin; }}
              style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
            >
              Back to login
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthConfirm;
