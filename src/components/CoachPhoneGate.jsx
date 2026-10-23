import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import { hasValidPhone, INVALID_PHONE_MESSAGE } from '../utils/coachPhone';

// Phone is compulsory for every coach. Sign Up already requires it, but
// coaches created by the Google auto-provision path (Google gives no number)
// or before that rule existed have none — this blocks the dashboard until
// they add one. Only shown once the DB confirms the number is missing, so a
// slow/failed read never locks a coach out.
export default function CoachPhoneGate() {
  const [needsPhone, setNeedsPhone] = useState(false);
  const [digits, setDigits] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (hasValidPhone(localStorage.getItem('userPhone'))) return;
    const email = localStorage.getItem('userEmail');
    if (!email) return;
    let cancelled = false;
    databaseService.getUserProfileByEmail(email).then(profile => {
      if (cancelled || !profile) return;
      if (hasValidPhone(profile.phone)) {
        localStorage.setItem('userPhone', profile.phone);
        return;
      }
      setNeedsPhone(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!needsPhone) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!hasValidPhone(digits)) {
      setError(INVALID_PHONE_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      await databaseService.saveCoachPhone(localStorage.getItem('userId'), `+91${digits}`);
      setNeedsPhone(false);
    } catch (err) {
      setError(err.message || 'Could not save your phone number. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="coach-phone-gate-title" style={{
      position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(5, 8, 16, 0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box'
    }}>
      <form onSubmit={submit} style={{
        width: '100%', maxWidth: '400px', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: '16px', padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: '14px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)'
      }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(67, 100, 189, 0.12)', border: '1px solid rgba(67, 100, 189, 0.3)', color: 'var(--primary-accent-light)'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>
        <div>
          <h3 id="coach-phone-gate-title" style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
            Add your phone number
          </h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            A phone number is required for every coach account so we can reach you about your clients and account.
          </p>
        </div>

        {error && (
          <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.78rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{
            padding: '10px 12px', background: 'rgba(var(--fg-rgb), 0.04)', border: '1px solid var(--border-color)',
            borderRadius: '8px', color: 'var(--text-main)', fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center'
          }}>+91</span>
          <input
            type="tel"
            inputMode="numeric"
            autoFocus
            aria-label="10-digit mobile number"
            value={digits}
            onChange={e => { setError(''); setDigits(e.target.value.replace(/\D/g, '').slice(0, 10)); }}
            placeholder="10-digit mobile number"
            style={{
              flex: 1, minWidth: 0, background: 'rgba(var(--fg-rgb), 0.04)', border: '1px solid var(--border-color)',
              borderRadius: '8px', padding: '10px 12px', color: 'var(--text-main)', fontSize: '16px', outline: 'none'
            }}
          />
        </div>

        <button type="submit" disabled={saving} style={{
          padding: '11px', borderRadius: '10px', border: 'none', fontWeight: 700, fontSize: '0.9rem', cursor: saving ? 'default' : 'pointer',
          background: 'var(--primary-accent)', color: '#fff', opacity: saving ? 0.7 : 1
        }}>
          {saving ? 'Saving…' : 'Save and continue'}
        </button>
      </form>
    </div>
  );
}
