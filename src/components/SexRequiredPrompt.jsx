import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import { SEX_OPTIONS } from '../utils/targets';
import './SexRequiredPrompt.css';

// Sex became a required onboarding field after most clients had already
// onboarded, so their profiles have none — and the wizard never runs again
// for them. This blocks the client app (no close button, nothing behind it is
// tappable) until they pick one. It sets their calorie targets' formula and
// which body (male/female) the muscle heat map and icons draw.
//
// Shown only when the profile really has no sex: localStorage first, then the
// server (a login on a new device may not have hydrated it yet).
const SexRequiredPrompt = () => {
  const [needed, setNeeded] = useState(false);
  const [sex, setSex] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (localStorage.getItem('userSex')) return undefined;
    let cancelled = false;
    const email = localStorage.getItem('userEmail');
    (email ? databaseService.getUserProfileByEmail(email).catch(() => null) : Promise.resolve(null))
      .then(profile => {
        if (cancelled) return;
        if (profile?.userSex) localStorage.setItem('userSex', profile.userSex);
        else setNeeded(true);
      });
    return () => { cancelled = true; };
  }, []);

  if (!needed) return null;

  const save = async () => {
    if (!sex) { setError('Please select Male or Female.'); return; }
    setSaving(true);
    setError('');
    try {
      await databaseService.saveClientSex(sex);
      setNeeded(false);
    } catch (e) {
      setError(e?.message || 'Could not save — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="srp-backdrop" role="dialog" aria-modal="true" aria-labelledby="srp-title">
      <div className="srp-modal">
        <h2 id="srp-title" className="srp-title">One quick thing</h2>
        <p className="srp-text">Select your sex to continue. It's used for your calorie targets and your muscle map.</p>
        <div className="srp-seg" role="radiogroup" aria-label="Sex">
          {SEX_OPTIONS.map(o => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={sex === o.id}
              className={`srp-seg-btn ${sex === o.id ? 'selected' : ''}`}
              onClick={() => { setSex(o.id); setError(''); }}
            >
              {o.label}
            </button>
          ))}
        </div>
        {error && <p className="srp-error" role="alert">{error}</p>}
        <button type="button" className="srp-continue" onClick={save} disabled={!sex || saving}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  );
};

export default SexRequiredPrompt;
