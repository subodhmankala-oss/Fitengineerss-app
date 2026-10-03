import React, { useEffect, useMemo, useState } from 'react';
import databaseService from '../services/databaseService';
import './FirstWorkoutPicker.css';

// "Start your first workout" chooser: level + Gym or Home (nothing is
// pre-selected — people choose both), then a big Start button that opens that category + level's first
// Workout Library program. Deliberately large type — these are the only
// decisions on the screen.
//
// Used in two places, the same screen so they can't drift apart:
//  - variant="signup": last screen of the sign-up wizard, once the answers
//    are saved. Almost no self-guided client ever did a workout after
//    signing up (3 of 26 in the 45 days to 2026-10-03): "Go to dashboard"
//    dropped them on a busy home screen at their most motivated moment.
//    Has "I'll start later" (onSkip) → dashboard.
//  - variant="home": the self-guided client's Home screen until they've
//    logged a first session (NextWorkoutBanner) — so choosing "later" at
//    sign-up gets them the same choice, not a Beginner-only banner. Passes
//    the library NextWorkoutBanner already loaded; no skip button.
//
// onStart(category, level, program) — caller queues the program and opens
// the Workouts tab.

const CATEGORIES = [
  { id: 'gym', emoji: '🏋️', label: 'At the gym' },
  { id: 'home', emoji: '🏠', label: 'At home' }
];

const LEVELS = [
  { id: 'beginner', emoji: '🌱', label: 'Beginner', desc: 'New to training, or getting back into it' },
  { id: 'intermediate', emoji: '💪', label: 'Intermediate', desc: 'Training regularly for 6+ months' },
  { id: 'advanced', emoji: '🔥', label: 'Advanced', desc: 'Training seriously for 2+ years' }
];

// { gym: { beginner: [programs], ... }, home: {...} } (the shape
// NextWorkoutBanner loads) → { gym: { beginner: first program | null, ... } }
function firstPrograms(library) {
  const out = {};
  CATEGORIES.forEach(c => {
    out[c.id] = {};
    LEVELS.forEach(l => { out[c.id][l.id] = library?.[c.id]?.[l.id]?.[0] || null; });
  });
  return out;
}

export default function FirstWorkoutPicker({ name, onStart, onSkip, variant = 'signup', library: providedLibrary }) {
  const [fetched, setFetched] = useState(null); // null = loading
  const [category, setCategory] = useState(null);
  const [level, setLevel] = useState(null);

  useEffect(() => {
    if (providedLibrary) return undefined;
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
        LEVELS.forEach((l, li) => { next[c.id][l.id] = lists[ci][li] || []; });
      });
      setFetched(next);
    });
    return () => { cancelled = true; };
  }, [providedLibrary]);

  const library = useMemo(
    () => (providedLibrary || fetched ? firstPrograms(providedLibrary || fetched) : null),
    [providedLibrary, fetched]
  );

  const isHome = variant === 'home';
  const firstName = (name || '').trim().split(/\s+/)[0];
  // Only offer what the library actually has.
  const levels = library ? LEVELS.filter(l => CATEGORIES.some(c => library[c.id][l.id])) : [];
  // Before a level is picked, offer every category that has any program;
  // after, only those with a program at that level.
  const categories = library
    ? CATEGORIES.filter(c => (level ? library[c.id][level] : LEVELS.some(l => library[c.id][l.id])))
    : [];
  const program = library && category && level ? library[category]?.[level] : null;
  const hasLibrary = levels.length > 0;

  const pickLevel = (id) => {
    setLevel(id);
    // Keep the gym/home pick only if that combination exists.
    if (category && !library[category][id]) setCategory(null);
  };

  return (
    <div className={isHome ? 'fwp fwp-home' : 'cow-step-content forward fwp'} key="first-workout">
      {isHome ? (
        <>
          <h2 className="fwp-title">🌱 New here? Let’s get you started</h2>
          <p className="fwp-subtitle">Pick your level and where you’ll train — we’ll set up your first workout.</p>
        </>
      ) : (
        <>
          <div className="cow-step-icon">🎉</div>
          <h2 className="fwp-title">You’re all set{firstName ? `, ${firstName}` : ''}!</h2>
          <p className="fwp-subtitle">Let’s do your first workout — a program from our library.</p>
        </>
      )}

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
              const p = level ? library[c.id][level] : null;
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
                      {p ? (
                        <>
                          {p.name}
                          {Array.isArray(p.exercises) && p.exercises.length > 0 && ` · ${p.exercises.length} exercise${p.exercises.length === 1 ? '' : 's'}`}
                        </>
                      ) : 'Pick your level to see your workout'}
                    </span>
                  </span>
                  <span className={`fwp-check ${category === c.id ? 'visible' : ''}`} aria-hidden="true">✓</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="fwp-start"
            disabled={!program}
            onClick={() => program && onStart(category, level, program)}
          >
            {program ? 'Start my first workout 💪' : level ? 'Pick gym or home' : 'Pick your level'}
          </button>
        </>
      )}

      {onSkip && (
        <button type="button" className="fwp-skip" onClick={onSkip}>
          {library !== null && !hasLibrary ? 'Go to dashboard 🚀' : 'I’ll start later'}
        </button>
      )}
    </div>
  );
}
