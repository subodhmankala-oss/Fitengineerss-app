import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import './FirstWorkoutPicker.css';

// Last screen of the sign-up wizard, shown once their answers are saved.
// Almost no self-guided client ever did a workout after signing up (3 of 26
// in the 45 days to 2026-10-03): "Go to dashboard" dropped them on a busy
// home screen at their most motivated moment and they left. This asks the
// two things needed to pick a Workout Library program — Gym or Home, and
// their level (Beginner pre-selected) — and starts the first program of that
// category + level straight away. Deliberately large text: these are the
// only decisions on the screen.
//
// onStart(category, level, program) — caller queues the program and opens
// the Workouts tab. onSkip() — "I'll start later", straight to the dashboard.

const CATEGORIES = [
  { id: 'gym', emoji: '🏋️', label: 'At the gym' },
  { id: 'home', emoji: '🏠', label: 'At home' }
];

const LEVELS = [
  { id: 'beginner', emoji: '🌱', label: 'Beginner', desc: 'New to training, or getting back into it' },
  { id: 'intermediate', emoji: '💪', label: 'Intermediate', desc: 'Training regularly for 6+ months' },
  { id: 'advanced', emoji: '🔥', label: 'Advanced', desc: 'Training seriously for 2+ years' }
];

export default function FirstWorkoutPicker({ name, onStart, onSkip }) {
  // { gym: { beginner: program|null, ... }, home: {...} }, or null = loading
  const [library, setLibrary] = useState(null);
  const [category, setCategory] = useState(null);
  const [level, setLevel] = useState('beginner');

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      CATEGORIES.map(c => Promise.all(
        LEVELS.map(l => databaseService.getGenericWorkoutsByLevel(l.id, c.id).catch(() => []))
      ))
    ).then((lists) => {
      if (cancelled) return;
      const next = {};
      CATEGORIES.forEach((c, ci) => {
        next[c.id] = {};
        LEVELS.forEach((l, li) => { next[c.id][l.id] = lists[ci][li]?.[0] || null; });
      });
      setLibrary(next);
    });
    return () => { cancelled = true; };
  }, []);

  const firstName = (name || '').trim().split(/\s+/)[0];
  // Only offer what the library actually has.
  const levels = library ? LEVELS.filter(l => CATEGORIES.some(c => library[c.id][l.id])) : [];
  const categories = library ? CATEGORIES.filter(c => library[c.id][level]) : [];
  const program = library && category ? library[category]?.[level] : null;
  const hasLibrary = levels.length > 0;

  const pickLevel = (id) => {
    setLevel(id);
    // Keep the gym/home pick only if that combination exists.
    if (category && !library[category][id]) setCategory(null);
  };

  return (
    <div className="cow-step-content forward fwp" key="first-workout">
      <div className="cow-step-icon">🎉</div>
      <h2 className="fwp-title">You’re all set{firstName ? `, ${firstName}` : ''}!</h2>
      <p className="fwp-subtitle">Let’s do your first workout — a program from our library.</p>

      {library === null ? (
        <p className="fwp-loading">Loading workouts…</p>
      ) : hasLibrary && (
        <>
          <h3 className="fwp-question">What’s your level?</h3>
          <div className="fwp-levels" role="radiogroup" aria-label="What’s your level?">
            {levels.map(l => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={level === l.id}
                className={`fwp-level ${level === l.id ? 'selected' : ''}`}
                onClick={() => pickLevel(l.id)}
              >
                <span className="fwp-level-emoji" aria-hidden="true">{l.emoji}</span>
                <span className="fwp-option-text">
                  <span className="fwp-level-label">{l.label}</span>
                  <span className="fwp-level-desc">{l.desc}</span>
                </span>
                <span className={`fwp-check ${level === l.id ? 'visible' : ''}`} aria-hidden="true">✓</span>
              </button>
            ))}
          </div>

          <h3 className="fwp-question">Where will you train?</h3>
          <div className="fwp-options" role="radiogroup" aria-label="Where will you train?">
            {categories.map(c => {
              const p = library[c.id][level];
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={category === c.id}
                  className={`fwp-option ${category === c.id ? 'selected' : ''}`}
                  onClick={() => setCategory(c.id)}
                >
                  <span className="fwp-emoji" aria-hidden="true">{c.emoji}</span>
                  <span className="fwp-option-text">
                    <span className="fwp-option-label">{c.label}</span>
                    <span className="fwp-option-desc">
                      {p.name}
                      {Array.isArray(p.exercises) && p.exercises.length > 0 && ` · ${p.exercises.length} exercise${p.exercises.length === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  <span className={`fwp-check ${category === c.id ? 'visible' : ''}`} aria-hidden="true">✓</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="cow-finish-btn fwp-start"
            disabled={!program}
            onClick={() => program && onStart(category, level, program)}
          >
            {program ? 'Start my first workout 💪' : 'Pick gym or home'}
          </button>
        </>
      )}

      <button type="button" className="fwp-skip" onClick={onSkip}>
        {library !== null && !hasLibrary ? 'Go to dashboard 🚀' : 'I’ll start later'}
      </button>
    </div>
  );
}
