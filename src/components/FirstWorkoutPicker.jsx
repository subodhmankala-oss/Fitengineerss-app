import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import './FirstWorkoutPicker.css';

// Last screen of the sign-up wizard, shown once their answers are saved.
// Almost no self-guided client ever did a workout after signing up (3 of 26
// in the 45 days to 2026-10-03): "Go to dashboard" dropped them on a busy
// home screen at their most motivated moment and they left. This asks the
// one question needed to pick a Workout Library program — Gym or Home — and
// starts the first Beginner program of that category straight away.
// Deliberately large text: it's the one decision on the screen.
//
// onStart(category, program) — caller queues the program and opens the
// Workouts tab. onSkip() — "I'll start later", straight to the dashboard.
export default function FirstWorkoutPicker({ name, onStart, onSkip }) {
  const [programs, setPrograms] = useState(null); // null = loading
  const [choice, setChoice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      databaseService.getGenericWorkoutsByLevel('beginner', 'gym').catch(() => []),
      databaseService.getGenericWorkoutsByLevel('beginner', 'home').catch(() => [])
    ]).then(([gym, home]) => {
      if (!cancelled) setPrograms({ gym: gym?.[0] || null, home: home?.[0] || null });
    });
    return () => { cancelled = true; };
  }, []);

  const firstName = (name || '').trim().split(/\s+/)[0];
  const options = programs ? [
    programs.gym && { id: 'gym', emoji: '🏋️', label: 'At the gym', program: programs.gym },
    programs.home && { id: 'home', emoji: '🏠', label: 'At home', program: programs.home }
  ].filter(Boolean) : [];
  const picked = options.find(o => o.id === choice);

  return (
    <div className="cow-step-content forward fwp" key="first-workout">
      <div className="cow-step-icon">🎉</div>
      <h2 className="fwp-title">You’re all set{firstName ? `, ${firstName}` : ''}!</h2>
      <p className="fwp-subtitle">Let’s do your first workout — a beginner program from our library. Where will you train?</p>

      {programs === null ? (
        <p className="fwp-loading">Loading workouts…</p>
      ) : options.length > 0 && (
        <div className="fwp-options" role="radiogroup" aria-label="Where will you train?">
          {options.map(opt => (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={choice === opt.id}
              className={`fwp-option ${choice === opt.id ? 'selected' : ''}`}
              onClick={() => setChoice(opt.id)}
            >
              <span className="fwp-emoji" aria-hidden="true">{opt.emoji}</span>
              <span className="fwp-option-text">
                <span className="fwp-option-label">{opt.label}</span>
                <span className="fwp-option-desc">
                  {opt.program.name}
                  {Array.isArray(opt.program.exercises) && opt.program.exercises.length > 0 && ` · ${opt.program.exercises.length} exercises`}
                </span>
              </span>
              <span className={`fwp-check ${choice === opt.id ? 'visible' : ''}`} aria-hidden="true">✓</span>
            </button>
          ))}
        </div>
      )}

      {options.length > 0 && (
        <button
          type="button"
          className="cow-finish-btn fwp-start"
          disabled={!picked}
          onClick={() => picked && onStart(picked.id, picked.program)}
        >
          {picked ? 'Start my first workout 💪' : 'Pick gym or home'}
        </button>
      )}

      <button type="button" className="fwp-skip" onClick={onSkip}>
        {programs !== null && options.length === 0 ? 'Go to dashboard 🚀' : 'I’ll start later'}
      </button>
    </div>
  );
}
