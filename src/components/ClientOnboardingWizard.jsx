import React, { useState } from 'react';
import databaseService from '../services/databaseService';
import './ClientOnboardingWizard.css';

const TOTAL_STEPS = 4;

const ClientOnboardingWizard = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1 — Body stats
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

  const goNext = () => {
    setSlideDir('forward');
    setStep(s => Math.min(s + 1, TOTAL_STEPS));
  };

  const goBack = () => {
    setSlideDir('backward');
    setStep(s => Math.max(s - 1, 1));
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      await databaseService.saveClientOnboardingData({
        age: age || '30',
        weight_kg: weight || '70',
        height_cm: height || '175',
        program: program || 'fat_loss',
        activity_level: activityLevel || 'moderately_active',
        primary_concern: primaryConcern || 'just_stay_fit'
      });
    } catch (err) {
      console.error('Wizard save error:', err);
    } finally {
      setIsSubmitting(false);
      onComplete();
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

      <div className="cow-option-grid">
        {programOptions.map(opt => (
          <button
            key={opt.id}
            className={`cow-option-card ${program === opt.id ? 'selected' : ''}`}
            onClick={() => setProgram(opt.id)}
          >
            <span className="cow-option-emoji">{opt.emoji}</span>
            <span className="cow-option-label">{opt.label}</span>
            <span className="cow-option-desc">{opt.desc}</span>
          </button>
        ))}
      </div>

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

      <div className="cow-option-list">
        {activityOptions.map(opt => (
          <button
            key={opt.id}
            className={`cow-option-row ${activityLevel === opt.id ? 'selected' : ''}`}
            onClick={() => setActivityLevel(opt.id)}
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

      <div className="cow-option-list">
        {concernOptions.map(opt => (
          <button
            key={opt.id}
            className={`cow-option-row ${primaryConcern === opt.id ? 'selected' : ''}`}
            onClick={() => setPrimaryConcern(opt.id)}
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
