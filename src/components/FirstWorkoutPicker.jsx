import React, { useMemo, useState } from 'react';
import './FirstWorkoutPicker.css';

// "Start your first workout" chooser: level + Gym or Home (nothing is
// pre-selected — people choose both), then a Start button that opens that
// category + level's first Workout Library program.
//
// Shown by NextWorkoutBanner on a self-guided client's Home screen until
// they've logged a first session. Almost no self-guided client ever did a
// workout after signing up (3 of 26 in the 45 days to 2026-10-03), and the
// old banner here offered Beginner only, with no level choice. The banner
// owns the library (it already loads all six level x category lists), the
// close button and the dismissal.
//
// library: { gym: { beginner: [programs], ... }, home: { ... } }
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

// → { gym: { beginner: first program | null, ... }, home: { ... } }
function firstPrograms(library) {
  const out = {};
  CATEGORIES.forEach(c => {
    out[c.id] = {};
    LEVELS.forEach(l => { out[c.id][l.id] = library?.[c.id]?.[l.id]?.[0] || null; });
  });
  return out;
}

export default function FirstWorkoutPicker({ library: providedLibrary, onStart }) {
  const [category, setCategory] = useState(null);
  const [level, setLevel] = useState(null);

  const library = useMemo(() => firstPrograms(providedLibrary), [providedLibrary]);

  // Only offer what the library actually has.
  const levels = LEVELS.filter(l => CATEGORIES.some(c => library[c.id][l.id]));
  // Before a level is picked, offer every category that has any program;
  // after, only those with a program at that level.
  const categories = CATEGORIES.filter(c => (level ? library[c.id][level] : LEVELS.some(l => library[c.id][l.id])));
  const program = category && level ? library[category]?.[level] : null;

  const pickLevel = (id) => {
    setLevel(id);
    // Keep the gym/home pick only if that combination exists.
    if (category && !library[category][id]) setCategory(null);
  };

  if (levels.length === 0) return null;

  return (
    <div className="fwp">
      <h2 className="fwp-title">🌱 New here? Let’s get you started</h2>
      <p className="fwp-subtitle">Pick your level and where you’ll train — we’ll set up your first workout.</p>

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
    </div>
  );
}
