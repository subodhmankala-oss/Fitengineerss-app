import React, { useMemo, useState } from 'react';
import TrainingDayPicker from './TrainingDayPicker';
import { DEFAULT_TRAINING_DAYS } from '../utils/weekPlan';
import './FirstWorkoutPicker.css';

// "Let's make your workout plan": level + Gym or Home (nothing is
// pre-selected — people choose both) + training days (Mon/Wed/Sat to start
// with), then "Make my plan", which turns Home into that week's workout
// cards (WeekPlanCard).
//
// Shown by NextWorkoutBanner on a self-guided client's Home screen until
// they've made a plan or logged a first session. The banner owns the library
// (it already loads all six level x category lists), the close button and
// the dismissal.
//
// library: { gym: { beginner: [programs], ... }, home: { ... } }
// onMakePlan(category, level, days)

const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

const CATEGORIES = [
  { id: 'gym', label: 'At the gym', path: 'M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11' },
  { id: 'home', label: 'At home', path: 'M3 11l9-8 9 8M5 9.5V20h14V9.5M10 20v-6h4v6' }
];

// bars: one, two or three rising bars.
const LEVELS = [
  { id: 'beginner', label: 'Beginner', desc: 'New or getting back', bars: 'M5 20v-5' },
  { id: 'intermediate', label: 'Intermediate', desc: 'Training 6+ months', bars: 'M5 20v-5M12 20V10' },
  { id: 'advanced', label: 'Advanced', desc: 'Training 2+ years', bars: 'M5 20v-5M12 20V10M19 20V4' }
];

// → { gym: { beginner: has programs?, ... }, home: { ... } }
function availability(library) {
  const out = {};
  CATEGORIES.forEach(c => {
    out[c.id] = {};
    LEVELS.forEach(l => { out[c.id][l.id] = (library?.[c.id]?.[l.id]?.length || 0) > 0; });
  });
  return out;
}

export default function FirstWorkoutPicker({ library, onMakePlan }) {
  const [category, setCategory] = useState(null);
  const [level, setLevel] = useState(null);
  const [days, setDays] = useState(DEFAULT_TRAINING_DAYS);

  const has = useMemo(() => availability(library), [library]);

  // Only offer what the library actually has.
  const levels = LEVELS.filter(l => CATEGORIES.some(c => has[c.id][l.id]));
  // Before a level is picked, offer every category that has any program;
  // after, only those with a program at that level.
  const categories = CATEGORIES.filter(c => (level ? has[c.id][level] : LEVELS.some(l => has[c.id][l.id])));

  const pickLevel = (id) => {
    setLevel(id);
    // Keep the gym/home pick only if that combination exists.
    if (category && !has[category][id]) setCategory(null);
  };

  if (levels.length === 0) return null;

  let missing = null;
  if (!level) missing = 'Pick your level';
  else if (!category) missing = 'Pick gym or home';
  else if (days.length === 0) missing = 'Pick your days';

  return (
    <div className="fwp">
      <h2 className="fwp-title">Let’s make your workout plan</h2>
      <p className="fwp-subtitle">Three quick answers and your week is ready.</p>

      <h3 className="fwp-question">What’s your level?</h3>
      <div className="fwp-levels" role="radiogroup" aria-label="What’s your level?">
        {levels.map(l => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={level === l.id}
            className={`fwp-level fwp-level-${l.id} ${level === l.id ? 'selected' : ''}`}
            onClick={() => pickLevel(l.id)}
          >
            <svg {...svg} className="fwp-level-icon" width="22" height="22" strokeWidth="3"><path d={l.bars} /></svg>
            <span className="fwp-level-label">{l.label}</span>
            <span className="fwp-level-desc">{l.desc}</span>
          </button>
        ))}
      </div>

      <h3 className="fwp-question">Where will you train?</h3>
      <div className="fwp-options" role="radiogroup" aria-label="Where will you train?">
        {categories.map(c => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={category === c.id}
            className={`fwp-option ${category === c.id ? 'selected' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            <svg {...svg} width="20" height="20" strokeWidth="2"><path d={c.path} /></svg>
            <span className="fwp-option-label">{c.label}</span>
          </button>
        ))}
      </div>

      <h3 className="fwp-question">
        Which days suit you?
        <span className="fwp-day-count">{days.length} day{days.length === 1 ? '' : 's'}</span>
      </h3>
      <TrainingDayPicker days={days} onChange={setDays} />

      <button
        type="button"
        className="fwp-start"
        disabled={!!missing}
        onClick={() => !missing && onMakePlan(category, level, days)}
      >
        {missing || 'Make my plan'}
      </button>
    </div>
  );
}
