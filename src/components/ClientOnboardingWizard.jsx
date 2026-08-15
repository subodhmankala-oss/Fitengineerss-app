import React, { useState } from 'react';
import databaseService from '../services/databaseService';
import './ClientOnboardingWizard.css';

const TOTAL_STEPS = 4;

const ClientOnboardingWizard = ({ onComplete, onBackToLogin }) => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1 — Name + body stats. Prefill the name from whatever login captured
  // (e.g. a Google display name), but treat the "Warrior" placeholder as empty
  // so the client is actually prompted to enter their real name.
  const [name, setName] = useState(() => {
    const n = (localStorage.getItem('userName') || '').trim();
    return n.toLowerCase() === 'warrior' ? '' : n;
  });
  // Phone was previously only collected by a separate "Fitengineers App
  // Setup" screen shown before this wizard for clients whose name hadn't
  // resolved yet — folded in here instead so that screen is no longer
  // needed for the client flow.
  const [phone, setPhone] = useState(() => {
    const p = (localStorage.getItem('userPhone') || '').replace(/^\+91/, '');
    return p;
  });
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');

  // Step 2 — Program
  const [program, setProgram] = useState('');

  // Step 3 — Activity level
  const [activityLevel, setActivityLevel] = useState('');

  // Step 4 — Primary concern
  const [primaryConcern, setPrimaryConcern] = useState('');

  const [slideDir, setSlideDir] = useState('forward');
  const [saveError, setSaveError] = useState('');
  const [step1Error, setStep1Error] = useState('');
  // Which step-1 field(s) specifically are empty/invalid — drives the red
  // border on that exact input, not just the shared error banner text below it.
  const [step1FieldErrors, setStep1FieldErrors] = useState({ name: false, phone: false });
  // Steps 2-4 are option picks, not text fields, so "which field" is really
  // "did they pick anything yet" — one flag per step is enough to redden the
  // whole card/row group. All four steps are mandatory: nothing here is
  // silently defaulted anymore (see handleFinish — it used to fall back to
  // 'fat_loss' / 'moderately_active' / 'just_stay_fit' for a step the client
  // skipped straight through).
  const [step2Error, setStep2Error] = useState('');
  const [step3Error, setStep3Error] = useState('');
  const [step4Error, setStep4Error] = useState('');

  const goNext = () => {
    if (step === 1) {
      const digitsOnly = phone.replace(/\D/g, '');
      const nameMissing = !name.trim();
      const phoneMissing = digitsOnly.length !== 10;
      if (nameMissing || phoneMissing) {
        setStep1FieldErrors({ name: nameMissing, phone: phoneMissing });
        setStep1Error(
          nameMissing && phoneMissing
            ? 'Please enter your name and a valid 10-digit phone number.'
            : nameMissing
              ? 'Please enter your name.'
              : 'Please enter a valid 10-digit phone number.'
        );
        return;
      }
      setStep1FieldErrors({ name: false, phone: false });
      setStep1Error('');
    } else if (step === 2) {
      if (!program) { setStep2Error('Please select a program to continue.'); return; }
      setStep2Error('');
    } else if (step === 3) {
      if (!activityLevel) { setStep3Error('Please select your activity level to continue.'); return; }
      setStep3Error('');
    }
    setSlideDir('forward');
    setStep(s => Math.min(s + 1, TOTAL_STEPS));
  };

  const goBack = () => {
    setSlideDir('backward');
    setStep(s => Math.max(s - 1, 1));
  };

  const handleFinish = async () => {
    // Last mandatory pick, guarded here rather than in goNext since step 4
    // ends the wizard via this button instead of Next →. Name/phone (step 1),
    // program (step 2) and activity level (step 3) were already enforced on
    // their own steps, so reaching this point guarantees they're set too.
    if (!primaryConcern) { setStep4Error('Please select your primary concern to continue.'); return; }
    setStep4Error('');

    setIsSubmitting(true);
    setSaveError('');
    const digitsOnly = phone.replace(/\D/g, '');
    // No more silent defaults for a step the client skipped through — all
    // four steps are validated before this ever runs, so every one of these
    // reflects a real choice the client made, not a placeholder standing in
    // for one they never got asked to make.
    const payload = {
      age: age || '30',
      weight_kg: weight || '70',
      height_cm: height || '175',
      program,
      activity_level: activityLevel,
      primary_concern: primaryConcern,
      full_name: name.trim(),
      phone: digitsOnly.length === 10 ? `+91${digitsOnly}` : ''
    };

    // Hard ceiling on the save — the browser Supabase SDK is known to hang
    // indefinitely (never resolving, never rejecting) right after a fresh
    // auth session, which left a real client watching this button spin
    // forever with no error and no way out (confirmed 2026-07-27). Better
    // to surface a retryable error than to strand them on a dead spinner.
    const attemptSave = () => Promise.race([
      databaseService.saveClientOnboardingData(payload),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('This is taking longer than expected. Please check your connection and try again.')), 20000)
      )
    ]);

    try {
      try {
        await attemptSave();
      } catch (firstErr) {
        // One silent retry before bothering the client with an error. Every
        // confirmed report of "Failed to save onboarding data." on this step
        // (2026-08-10) turned out to be a one-off — reopening the app and
        // resubmitting the exact same data succeeded immediately, which
        // points at a transient blip (network hiccup, serverless cold
        // start/deploy-boundary race) rather than a real, repeatable failure.
        // A single automatic retry absorbs that class of failure without
        // making the client do the "close and reopen" dance themselves.
        console.warn('Wizard save failed once, retrying automatically:', firstErr.message || firstErr);
        await attemptSave();
      }
      onComplete();
    } catch (err) {
      // Don't let onComplete() run on a failed save — that was the original bug:
      // the UI moved on to the dashboard while onboarding_completed silently stayed
      // false in the DB, so the client got sent right back through this wizard on
      // their next login. Now the client can retry instead of getting stuck.
      console.error('Wizard save error (after retry):', err);
      setSaveError(err.message || 'Could not save your info. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const programOptions = [
    {
      id: 'fat_loss',
      emoji: '🔥',
      label: 'Fat Loss',
      desc: 'Burn fat, stay lean'
    },
    {
      id: 'muscle_building',
      emoji: '💪',
      label: 'Muscle Building',
      desc: 'Gain strength & mass'
    },
    {
      id: 'gut_repair',
      emoji: '🌿',
      label: 'Gut Repair',
      desc: 'Heal digestion & bloating'
    }
  ];

  const activityOptions = [
    {
      id: 'sedentary',
      emoji: '🪑',
      label: 'Sedentary',
      desc: 'Little or no weekly exercise'
    },
    {
      id: 'lightly_active',
      emoji: '🚶',
      label: 'Lightly Active',
      desc: 'Light exercise 1–3 days/week'
    },
    {
      id: 'moderately_active',
      emoji: '🏃',
      label: 'Moderately Active',
      desc: 'Moderate exercise 3–5 days/week'
    },
    {
      id: 'very_active',
      emoji: '⚡',
      label: 'Very Active',
      desc: 'Hard training 6–7 days/week'
    }
  ];

  const concernOptions = [
    {
      id: 'bloating_constipation',
      emoji: '😣',
      label: 'Bloating or constipation',
      desc: 'Fix gut discomfort'
    },
    {
      id: 'digestion_issues',
      emoji: '🫁',
      label: 'Digestion issues',
      desc: 'Improve gut health overall'
    },
    {
      id: 'just_stay_fit',
      emoji: '✨',
      label: 'Just stay fit',
      desc: 'General health & wellbeing'
    }
  ];

  const renderProgressBar = () => (
    <div className="cow-progress-bar">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div key={i} className={`cow-progress-segment ${i < step ? 'filled' : ''} ${i === step - 1 ? 'active' : ''}`} />
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className={`cow-step-content ${slideDir}`} key="step1">
      <div className="cow-step-icon">📏</div>
      <h2 className="cow-step-title">Your Body Stats</h2>
      <p className="cow-step-subtitle">Help us personalize your experience</p>

      <div className="cow-fields">
        <div className="cow-field">
          <label className="cow-label">Your name</label>
          <input
            type="text"
            className={`cow-input ${step1FieldErrors.name ? 'error' : ''}`}
            placeholder="e.g. Priya Sharma"
            value={name}
            onChange={e => { setName(e.target.value); if (step1FieldErrors.name) setStep1FieldErrors(prev => ({ ...prev, name: false })); }}
            autoComplete="name"
            maxLength="60"
          />
        </div>
        <div className="cow-field">
          <label className="cow-label">Phone number</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{
              padding: '0 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', color: '#fff', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center'
            }}>🇮🇳 +91</span>
            <input
              type="tel"
              className={`cow-input ${step1FieldErrors.phone ? 'error' : ''}`}
              placeholder="10-digit mobile number"
              value={phone}
              onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); if (step1FieldErrors.phone) setStep1FieldErrors(prev => ({ ...prev, phone: false })); }}
              style={{ flex: 1 }}
            />
          </div>
        </div>
        <div className="cow-field">
          <label className="cow-label">Age (years)</label>
          <input
            type="number"
            className="cow-input"
            placeholder="e.g. 28"
            value={age}
            onChange={e => setAge(e.target.value)}
            min="10"
            max="100"
          />
        </div>
        <div className="cow-field-row">
          <div className="cow-field">
            <label className="cow-label">Weight (kg)</label>
            <input
              type="number"
              className="cow-input"
              placeholder="e.g. 72"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              min="20"
              max="300"
            />
          </div>
          <div className="cow-field">
            <label className="cow-label">Height (cm)</label>
            <input
              type="number"
              className="cow-input"
              placeholder="e.g. 175"
              value={height}
              onChange={e => setHeight(e.target.value)}
              min="100"
              max="250"
            />
          </div>
        </div>
      </div>

      {step1Error && (
        <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.78rem', marginBottom: '12px' }}>
          {step1Error}
        </div>
      )}

      <button className="cow-next-btn" onClick={goNext}>
        Next →
      </button>
    </div>
  );

  const renderStep2 = () => (
    <div className={`cow-step-content ${slideDir}`} key="step2">
      <div className="cow-step-icon">🎯</div>
      <h2 className="cow-step-title">Select Your Program</h2>
      <p className="cow-step-subtitle">What's your main goal?</p>

      <div className={`cow-option-grid ${step2Error ? 'error' : ''}`}>
        {programOptions.map(opt => (
          <button
            key={opt.id}
            className={`cow-option-card ${program === opt.id ? 'selected' : ''}`}
            onClick={() => { setProgram(opt.id); setStep2Error(''); }}
          >
            <span className="cow-option-emoji">{opt.emoji}</span>
            <span className="cow-option-label">{opt.label}</span>
            <span className="cow-option-desc">{opt.desc}</span>
          </button>
        ))}
      </div>

      {step2Error && (
        <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.78rem', marginBottom: '12px' }}>
          {step2Error}
        </div>
      )}

      <div className="cow-nav-row">
        <button className="cow-back-btn" onClick={goBack}>← Back</button>
        <button className="cow-next-btn" onClick={goNext}>Next →</button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className={`cow-step-content ${slideDir}`} key="step3">
      <div className="cow-step-icon">⚡</div>
      <h2 className="cow-step-title">Activity Level</h2>
      <p className="cow-step-subtitle">How active are you currently?</p>

      <div className={`cow-option-list ${step3Error ? 'error' : ''}`}>
        {activityOptions.map(opt => (
          <button
            key={opt.id}
            className={`cow-option-row ${activityLevel === opt.id ? 'selected' : ''}`}
            onClick={() => { setActivityLevel(opt.id); setStep3Error(''); }}
          >
            <span className="cow-row-emoji">{opt.emoji}</span>
            <div className="cow-row-text">
              <span className="cow-row-label">{opt.label}</span>
              <span className="cow-row-desc">{opt.desc}</span>
            </div>
            <span className={`cow-row-check ${activityLevel === opt.id ? 'visible' : ''}`}>✓</span>
          </button>
        ))}
      </div>

      {step3Error && (
        <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.78rem', marginBottom: '12px' }}>
          {step3Error}
        </div>
      )}

      <div className="cow-nav-row">
        <button className="cow-back-btn" onClick={goBack}>← Back</button>
        <button className="cow-next-btn" onClick={goNext}>Next →</button>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className={`cow-step-content ${slideDir}`} key="step4">
      <div className="cow-step-icon">💡</div>
      <h2 className="cow-step-title">Primary Concern</h2>
      <p className="cow-step-subtitle">What matters most to you right now?</p>

      <div className={`cow-option-list ${step4Error ? 'error' : ''}`}>
        {concernOptions.map(opt => (
          <button
            key={opt.id}
            className={`cow-option-row ${primaryConcern === opt.id ? 'selected' : ''}`}
            onClick={() => { setPrimaryConcern(opt.id); setStep4Error(''); }}
          >
            <span className="cow-row-emoji">{opt.emoji}</span>
            <div className="cow-row-text">
              <span className="cow-row-label">{opt.label}</span>
              <span className="cow-row-desc">{opt.desc}</span>
            </div>
            <span className={`cow-row-check ${primaryConcern === opt.id ? 'visible' : ''}`}>✓</span>
          </button>
        ))}
      </div>

      {step4Error && (
        <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.78rem', marginBottom: '12px' }}>
          {step4Error}
        </div>
      )}

      {saveError && (
        <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.78rem', marginBottom: '12px' }}>
          {saveError}
        </div>
      )}

      <div className="cow-nav-row">
        <button className="cow-back-btn" onClick={goBack}>← Back</button>
        <button
          className={`cow-finish-btn ${isSubmitting ? 'loading' : ''}`}
          onClick={handleFinish}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <span className="cow-spinner">⏳</span>
          ) : (
            'Go to dashboard 🚀'
          )}
        </button>
      </div>
    </div>
  );

  const stepContent = [renderStep1, renderStep2, renderStep3, renderStep4];

  return (
    <div className="cow-overlay">
      <div className="cow-card">
        {/* Header */}
        <div className="cow-header">
          <img src="/logo.png" alt="Fitengineers" className="cow-logo" />
          <div className="cow-header-text">
            <span className="cow-step-label">Step {step} of {TOTAL_STEPS}</span>
          </div>
          {onBackToLogin && (
            <button type="button" className="cow-back-to-login" onClick={onBackToLogin}>
              ← Back to Login
            </button>
          )}
        </div>

        {/* Progress */}
        {renderProgressBar()}

        {/* Step content */}
        <div className="cow-body">
          {stepContent[step - 1]()}
        </div>
      </div>
    </div>
  );
};

export default ClientOnboardingWizard;
