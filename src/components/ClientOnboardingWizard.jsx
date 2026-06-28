import React, { useState } from 'react';

const PROGRAM_OPTIONS = [
  { value: 'fat_loss', emoji: '🔥', label: 'Fat loss', desc: 'Stay in a caloric deficit & retain lean mass' },
  { value: 'muscle_building', emoji: '💪', label: 'Muscle building', desc: 'Anabolic surplus & progressive overload' },
  { value: 'gut_repair', emoji: '🌱', label: 'Gut repair', desc: 'Fix digestion & restore gut microbiome' }
];

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentary', desc: 'Little or no weekly exercise' },
  { value: 'lightly_active', label: 'Lightly active', desc: 'Light exercise/sports 1-3 days/week' },
  { value: 'moderately_active', label: 'Moderately active', desc: 'Moderate exercise 3-5 days/week' },
  { value: 'very_active', label: 'Very active', desc: 'Hard training/sports 6-7 days/week' }
];

const CONCERN_OPTIONS = [
  { value: 'bloating_constipation', emoji: '🎈', label: 'Bloating or constipation' },
  { value: 'digestion_issues', emoji: '🔥', label: 'Digestion issues' },
  { value: 'just_stay_fit', emoji: '✨', label: 'Just stay fit' }
];

const TOTAL_WIZARD_STEPS = 4;

// One-time, post-signup wizard. Local-only state until the final step — the
// caller's onSubmit is only invoked once, from step 4, so a client who closes
// the app partway through never leaves a partial record behind.
const ClientOnboardingWizard = ({ initialData, onSubmit }) => {
  const [wizardStep, setWizardStep] = useState(1);
  const [age, setAge] = useState(initialData?.age || '');
  const [weight, setWeight] = useState(initialData?.weight || '');
  const [height, setHeight] = useState(initialData?.height || '');
  const [program, setProgram] = useState(initialData?.program || '');
  const [activityLevel, setActivityLevel] = useState(initialData?.activityLevel || '');
  const [primaryConcern, setPrimaryConcern] = useState(initialData?.primaryConcern || '');
  const [submitting, setSubmitting] = useState(false);

  const goNext = () => setWizardStep(s => Math.min(TOTAL_WIZARD_STEPS, s + 1));
  const goBack = () => setWizardStep(s => Math.max(1, s - 1));

  const handleFinish = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ age, weight, height, program, activityLevel, primaryConcern });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="onboarding-header">
        <img src="/logo.png" className="onboarding-logo" alt="Fitengineers Logo" />
        <h2 className="glow-text">Set Up Your Profile</h2>
        <div className="step-bar">
          <div className="step-progress" style={{ width: `${(wizardStep / TOTAL_WIZARD_STEPS) * 100}%` }}></div>
        </div>
        <div className="step-counter">Step {wizardStep} of {TOTAL_WIZARD_STEPS}</div>
      </div>

      {wizardStep === 1 && (
        <div className="onboarding-step animate-in">
          <h3>Tell us about yourself</h3>
          <p className="step-hint">We use these to calculate your custom BMR and macro metrics.</p>
          <div className="input-group-row">
            <div className="input-field">
              <label>Age (years)</label>
              <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="25" min="10" max="100" />
            </div>
            <div className="input-field">
              <label>Height (cm)</label>
              <input type="number" value={height} onChange={e => setHeight(e.target.value)} placeholder="175" min="100" max="250" />
            </div>
          </div>
          <div className="input-field mt-2">
            <label>Weight (kg)</label>
            <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="72.5" step="0.1" min="30" max="250" />
          </div>
        </div>
      )}

      {wizardStep === 2 && (
        <div className="onboarding-step animate-in">
          <h3>Select a program</h3>
          <p className="step-hint">This defines your calorie offset and workout direction.</p>
          {PROGRAM_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`select-btn ${program === opt.value ? 'selected' : ''}`}
              onClick={() => setProgram(opt.value)}
            >
              <strong>{opt.emoji} {opt.label}</strong>
              <span className="btn-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      )}

      {wizardStep === 3 && (
        <div className="onboarding-step animate-in">
          <h3>What's your physical activity level?</h3>
          <p className="step-hint">This calibrates your daily maintenance TDEE score.</p>
          {ACTIVITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`select-btn ${activityLevel === opt.value ? 'selected' : ''}`}
              onClick={() => setActivityLevel(opt.value)}
            >
              <strong>{opt.label}</strong>
              <span className="btn-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      )}

      {wizardStep === 4 && (
        <div className="onboarding-step animate-in">
          <h3>What's your primary concern?</h3>
          <p className="step-hint">Helps us tailor your daily checklist and nudges.</p>
          {CONCERN_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`select-btn ${primaryConcern === opt.value ? 'selected' : ''}`}
              onClick={() => setPrimaryConcern(opt.value)}
            >
              {opt.emoji} {opt.label}
            </button>
          ))}
        </div>
      )}

      <div className="onboarding-actions" style={{ display: 'flex', gap: '12px', width: '100%', maxWidth: '400px', marginTop: '32px' }}>
        {wizardStep > 1 && (
          <button
            type="button"
            className="btn-back"
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.02)',
              color: '#94a3b8',
              fontWeight: '600',
              fontSize: '1.1rem',
              cursor: 'pointer'
            }}
            onClick={goBack}
          >
            ← Back
          </button>
        )}
        {wizardStep < TOTAL_WIZARD_STEPS ? (
          <button
            type="button"
            className="btn-next"
            style={{ flex: wizardStep > 1 ? 2 : 1, marginTop: 0, width: '100%' }}
            onClick={goNext}
          >
            Next Step ➔
          </button>
        ) : (
          <button
            type="button"
            className="btn-next"
            style={{ flex: 2, marginTop: 0, width: '100%' }}
            onClick={handleFinish}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : 'Go to dashboard'}
          </button>
        )}
      </div>
    </>
  );
};

export default ClientOnboardingWizard;
