import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import './SexRequiredPrompt.css';

// Phone became required at sign-up after many accounts already existed (most
// coaches and ~25 clients have none), and it's what every WhatsApp nudge in
// the app sends to. This blocks the app — same look and behaviour as
// SexRequiredPrompt — until they add a 10-digit Indian mobile number.
//
// Shown only when the profile really has no phone: localStorage first, then
// the server (a login on a new device may not have hydrated it yet).
//
// The one way past it without a number is "Skip for now", offered only after
// a save has failed — so an account whose row can't be updated (e.g. a
// profile not linked to its login) is never locked out of the app.
const PhoneRequiredPrompt = ({ role }) => {
  const [needed, setNeeded] = useState(false);
  const [digits, setDigits] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (localStorage.getItem('userPhone')) return undefined;
    let cancelled = false;
    const email = localStorage.getItem('userEmail');
    (email ? databaseService.getUserProfileByEmail(email).catch(() => null) : Promise.resolve(null))
      .then(profile => {
        if (cancelled) return;
        if (profile?.phone) localStorage.setItem('userPhone', profile.phone);
        // Couldn't read the profile at all (offline, no email) — don't nag on
        // a guess; it'll be checked again next launch.
        else if (profile) setNeeded(true);
      });
    return () => { cancelled = true; };
  }, []);

  if (!needed) return null;

  const save = async () => {
    if (digits.length !== 10) { setError('Please enter a valid 10-digit phone number.'); return; }
    setSaving(true);
    setError('');
    try {
      await databaseService.saveOwnPhone(`+91${digits}`, role);
      setNeeded(false);
    } catch (e) {
      setError(e?.message || 'Could not save — please try again.');
    } finally {
      setSaving(false);
    }
  };

  const text = role === 'coach'
    ? 'Add your mobile number to continue. The Fitengineers team uses it to reach you about your account and clients.'
    : 'Add your mobile number to continue. Your coach uses it to check in with you on WhatsApp.';

  return (
    <div className="srp-backdrop" role="dialog" aria-modal="true" aria-labelledby="prp-title">
      <div className="srp-modal">
        <h2 id="prp-title" className="srp-title">One quick thing</h2>
        <p className="srp-text">{text}</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{
            padding: '12px', borderRadius: '12px', background: 'rgba(var(--fg-rgb), 0.04)',
            border: '1px solid rgba(var(--fg-rgb), 0.1)', color: 'var(--text-main)', fontWeight: 700,
            fontSize: '16px', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap'
          }}>🇮🇳 +91</span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            aria-label="Mobile number"
            placeholder="10-digit mobile number"
            value={digits}
            onChange={e => { setDigits(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') save(); }}
            style={{
              flex: 1, minWidth: 0, padding: '12px', borderRadius: '12px', outline: 'none',
              background: 'rgba(var(--fg-rgb), 0.04)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
              color: 'var(--text-main)', fontFamily: 'inherit', fontSize: '16px'
            }}
          />
        </div>
        {error && <p className="srp-error" role="alert">{error}</p>}
        <button type="button" className="srp-continue" onClick={save} disabled={digits.length !== 10 || saving}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
        {error && !saving && (
          <button
            type="button"
            onClick={() => setNeeded(false)}
            style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
};

export default PhoneRequiredPrompt;
