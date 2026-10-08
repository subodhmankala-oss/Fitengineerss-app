import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import './SexRequiredPrompt.css';

// Coaches who sign up with Google are auto-provisioned from their Google name
// alone (see the auto-provision branch in App.jsx) — Google supplies no phone,
// and the coach signup form that does collect one is skipped. Phone is
// mandatory for coaches, so this blocks the coach app until one is saved.
//
// Shown only when the profile really has no phone: localStorage first, then the
// server (a login on a new device may not have hydrated it yet).
const CoachPhoneRequiredPrompt = () => {
  const [needed, setNeeded] = useState(false);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (localStorage.getItem('userPhone')) return undefined;
    let cancelled = false;
    const email = localStorage.getItem('userEmail');
    if (!email) return undefined;
    databaseService.getUserProfileByEmail(email).catch(() => undefined)
      .then(profile => {
        if (cancelled || profile === undefined) return; // couldn't read — don't nag on a failed lookup
        if (profile?.phone) localStorage.setItem('userPhone', profile.phone);
        else if (profile) setNeeded(true);
      });
    return () => { cancelled = true; };
  }, []);

  if (!needed) return null;

  const save = async () => {
    if (phone.length !== 10) { setError('Please enter a valid 10-digit phone number.'); return; }
    setSaving(true);
    setError('');
    try {
      await databaseService.saveCoachPhone(phone);
      setNeeded(false);
    } catch (e) {
      setError(e?.message || 'Could not save — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="srp-backdrop" role="dialog" aria-modal="true" aria-labelledby="cpr-title">
      <div className="srp-modal">
        <h2 id="cpr-title" className="srp-title">Add your phone number</h2>
        <p className="srp-text">A phone number is required for coach accounts. Enter your 10-digit mobile number to continue.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>+91</span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="10-digit mobile number"
            aria-label="Phone number"
            value={phone}
            onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
            style={{
              flex: 1, padding: '12px', borderRadius: '10px', fontSize: '1rem',
              background: 'rgba(var(--fg-rgb), 0.04)', border: '1px solid rgba(var(--fg-rgb), 0.1)',
              color: 'var(--text-main)', fontFamily: 'inherit'
            }}
          />
        </div>
        {error && <p className="srp-error" role="alert">{error}</p>}
        <button type="button" className="srp-continue" onClick={save} disabled={phone.length !== 10 || saving}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  );
};

export default CoachPhoneRequiredPrompt;
