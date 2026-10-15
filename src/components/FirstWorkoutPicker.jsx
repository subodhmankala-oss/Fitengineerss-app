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
// 2026-10-15 redesign ("looks very boring… make it advanced UI and
// engaging"; the three full-width level rows also pushed Intermediate and
// Advanced below the fold so only Beginner was visible): a two-step "build
// your plan" card — all three levels side by side as tiles with intensity
// bars, Gym/Home as big tiles, and a live preview of the first workout.
//
// library: { gym: { beginner: [programs], ... }, home: { ... } }
// onStart(category, level, program) — caller queues the program and opens
// the Workouts tab.

const CATEGORIES = [
  { id: 'gym', emoji: '🏋️', label: 'At the gym', hint: 'Machines & free weights' },
  { id: 'home', emoji: '🏠', label: 'At home', hint: 'Little or no equipment' }
];

const LEVELS = [
  { id: 'beginner', emoji: '🌱', label: 'Beginner', bars: 1, desc: 'New to training, or getting back into it' },
  { id: 'intermediate', emoji: '💪', label: 'Intermediate', bars: 2, desc: 'Training regularly for 6+ months' },
  { id: 'advanced', emoji: '🔥', label: 'Advanced', bars: 3, desc: 'Training seriously for 2+ years' }
];

const PREVIEW_EXERCISES = 3;

// → { gym: { beginner: first program | null, ... }, home: { ... } }
function firstPrograms(library) {
  const out = {};
  CATEGORIES.forEach(c => {
    out[c.id] = {};
    LEVELS.forEach(l => { out[c.id][l.id] = library?.[c.id]?.[l.id]?.[0] || null; });
  });
  return out;
}

function exerciseNames(program) {
  return (Array.isArray(program?.exercises) ? program.exercises : [])
    .map(ex => (typeof ex === 'string' ? ex : ex?.name))
    .filter(Boolean);
}

function IntensityBars({ count }) {
  return (
    <span className="fwp-bars" aria-hidden="true">
      {[1, 2, 3].map(i => <span key={i} className={`fwp-bar ${i <= count ? 'on' : ''}`} />)}
    </span>
  );
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
  const selectedLevel = LEVELS.find(l => l.id === level);
  const names = exerciseNames(program);

  const pickLevel = (id) => {
    setLevel(id);
    // Keep the gym/home pick only if that combination exists.
    if (category && !library[category][id]) setCategory(null);
  };

  if (levels.length === 0) return null;

  const step = !level ? 1 : !category ? 2 : 3;

  return (
    <div className="fwp">
      <div className="fwp-hero">
        <h2 className="fwp-title">🌱 New here? Let’s get you started</h2>
        <p className="fwp-subtitle">Two quick taps and your first workout is ready.</p>
        <ol className="fwp-steps" aria-label="Steps">
          <li className={`fwp-step ${step > 1 ? 'done' : 'active'}`}><span className="fwp-step-dot">{step > 1 ? '✓' : '1'}</span>Level</li>
          <li className="fwp-step-line" aria-hidden="true" />
          <li className={`fwp-step ${step > 2 ? 'done' : step === 2 ? 'active' : ''}`}><span className="fwp-step-dot">{step > 2 ? '✓' : '2'}</span>Place</li>
          <li className="fwp-step-line" aria-hidden="true" />
          <li className={`fwp-step ${step === 3 ? 'active' : ''}`}><span className="fwp-step-dot">3</span>Go</li>
        </ol>
      </div>

      <h3 className="fwp-question">What’s your level?</h3>
      <div className={`fwp-levels fwp-levels--${levels.length}`} role="radiogroup" aria-label="What’s your level?">
        {levels.map(l => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={level === l.id}
            className={`fwp-tile fwp-level ${level === l.id ? 'selected' : ''}`}
            onClick={() => pickLevel(l.id)}
          >
            <span className="fwp-tile-check" aria-hidden="true">✓</span>
            <span className="fwp-tile-icon" aria-hidden="true">{l.emoji}</span>
            <span className="fwp-level-label">{l.label}</span>
            <IntensityBars count={l.bars} />
          </button>
        ))}
      </div>
      <p className={`fwp-level-hint ${selectedLevel ? 'visible' : ''}`} aria-live="polite">
        {selectedLevel ? selectedLevel.desc : 'Not sure? Beginner is a great place to start.'}
      </p>

      <h3 className="fwp-question">Where will you train?</h3>
      <div className="fwp-options" role="radiogroup" aria-label="Where will you train?">
        {categories.map(c => {
          const p = level ? library[c.id][level] : null;
          const count = exerciseNames(p).length;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={category === c.id}
              className={`fwp-tile fwp-option ${category === c.id ? 'selected' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              <span className="fwp-tile-check" aria-hidden="true">✓</span>
              <span className="fwp-tile-icon fwp-tile-icon--lg" aria-hidden="true">{c.emoji}</span>
              <span className="fwp-option-label">{c.label}</span>
              <span className="fwp-option-desc">
                {p ? `${count ? `${count} exercises` : 'Ready to go'}` : c.hint}
              </span>
            </button>
          );
        })}
      </div>

      {program && (
        <div className="fwp-preview" key={`${category}-${level}`}>
          <div className="fwp-preview-head">
            <span className="fwp-preview-eyebrow">Your first workout</span>
            <span className="fwp-preview-name">{program.name}</span>
          </div>
          {names.length > 0 && (
            <div className="fwp-chips">
              {names.slice(0, PREVIEW_EXERCISES).map(n => <span key={n} className="fwp-chip">{n}</span>)}
              {names.length > PREVIEW_EXERCISES && (
                <span className="fwp-chip fwp-chip--more">+{names.length - PREVIEW_EXERCISES} more</span>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className={`fwp-start ${program ? 'ready' : ''}`}
        disabled={!program}
        onClick={() => program && onStart(category, level, program)}
      >
        {program ? 'Start my first workout 💪' : level ? 'Pick gym or home' : 'Pick your level'}
      </button>
    </div>
  );
}
