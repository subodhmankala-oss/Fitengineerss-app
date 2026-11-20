import React from 'react';
import MuscleThumbnail from './MuscleAnalytics/MuscleThumbnail';
import { getMuscleGroupsForExercise, parseMuscleText } from '../utils/muscleGroups';
import { busyPrompt } from '../utils/busySwap';
import './ExerciseCardTitle.css';

// The exercise card's title block, shared by the client logger and the coach
// Live Log (they must match): a round muscle picture with a play badge that
// opens the Form Guide, the exercise name (tap = history) with the ONE body
// part it mainly trains in everyday words beside it ("Back", not "Lats"), then
// one line: "Cable busy?" + a tinted chip with the stand-in.
// The card's ≡ menu stays beside it, unchanged.

// "Upper Chest (Pectoralis Major)" → "Upper Chest"; first of a list only.
const shortMuscle = (text) => String(text || '')
  .split(/[,;]/)[0]
  .replace(/\(.*?\)/g, '')
  .replace(/[:.]+\s*$/, '')
  .trim();

// Canonical group → the word anyone knows. Arms/Thighs/Hips over
// Biceps/Quads/Glutes so the card never needs gym vocabulary.
const PLAIN = {
  Chest: 'Chest', Back: 'Back', Shoulders: 'Shoulders',
  Biceps: 'Arms', Triceps: 'Arms', Forearms: 'Arms',
  Core: 'Core', Glutes: 'Hips', Quads: 'Thighs', Hamstrings: 'Thighs',
  Calves: 'Calves', Tibialis: 'Shins'
};

function getMainMuscle(name, record) {
  const canon = getMuscleGroupsForExercise(name) || [];
  const fromLibrary = shortMuscle(record?.primary_muscle);
  const libGroup = (fromLibrary && !/^none$/i.test(fromLibrary)) ? parseMuscleText(fromLibrary)[0] : null;
  const group = libGroup || canon[0] || null;
  return { label: group ? (PLAIN[group] || group) : '', thumb: canon[0] || group };
}

const SwapIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 17l-4 4M21 17l-4-4M21 17H8" /><path d="M3 7l4 4M3 7l4-4M3 7h13" />
  </svg>
);

// "Cable busy?  [⇄ Dumbbell Row 82%]" — one line, one tap. The prompt names
// what this exercise needs; the chip IS the swap. After a Busy? swap a small
// Undo sits at the end (until a set is ticked); after the 3rd only Undo stays.
function BusyLine({ name, option, onUndo }) {
  return (
    <div className="ect-busy">
      {option && <span className="ect-busy-q">{busyPrompt(name)}</span>}
      {option && (
        <button
          type="button"
          className="ect-chip"
          aria-label={`Swap to ${option.name}`}
          onClick={option.onSwap}
        >
          <SwapIcon />
          <span className="ect-chip-name">{option.name}</span>
          <span className="ect-chip-pct">{option.match}%</span>
        </button>
      )}
      {onUndo && (
        <button type="button" className="ect-busy-undo" onClick={onUndo}>Undo</button>
      )}
    </div>
  );
}

export default function ExerciseCardTitle({ name, record, onShowGuide, onShowHistory, busy, children }) {
  const { label: muscle, thumb } = getMainMuscle(name, record);
  return (
    <div className="ect">
      <button
        type="button"
        className="ect-thumb"
        aria-label={`Watch how to do ${name}`}
        onClick={onShowGuide}
      >
        {thumb
          ? <MuscleThumbnail muscle={thumb} color="#60a5fa" size={44} />
          : <span className="ect-mono">{String(name || '?').charAt(0)}</span>}
        <span className="ect-play" aria-hidden="true">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 21 12 6 21" /></svg>
        </span>
      </button>
      <div className="ect-text">
        <div className="ect-line">
          <h5
            className="ect-name ex-name-clickable"
            role="button"
            tabIndex={0}
            title="View exercise history"
            onClick={onShowHistory}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onShowHistory(); } }}
            // Same tap-to-focus scroll suppression the old name element had.
            onPointerDown={(e) => e.preventDefault()}
          >
            {name}
          </h5>
          {muscle && <span className="ect-muscle">{muscle}</span>}
        </div>
        {busy && (busy.option || busy.onUndo) && <BusyLine name={name} option={busy.option} onUndo={busy.onUndo} />}
        {children}
      </div>
    </div>
  );
}
