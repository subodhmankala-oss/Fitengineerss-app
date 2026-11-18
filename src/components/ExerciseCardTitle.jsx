import React, { useState } from 'react';
import MuscleThumbnail from './MuscleAnalytics/MuscleThumbnail';
import { getMuscleGroupsForExercise, parseMuscleText } from '../utils/muscleGroups';
import { getExerciseNote } from '../data/exerciseNotes';
import './ExerciseCardTitle.css';

// The exercise card's title block, shared by the client logger and the coach
// Live Log (they must match): a round muscle picture with a play badge that
// opens the Form Guide, the exercise name (tap = history) with the ONE muscle
// it mainly trains in plain text beside it, then the Busy? and Note lines.
// The card's ≡ menu stays beside it, unchanged.

// "Upper Chest (Pectoralis Major)" → "Upper Chest"; first of a list only.
const shortMuscle = (text) => String(text || '')
  .split(/[,;]/)[0]
  .replace(/\(.*?\)/g, '')
  .replace(/[:.]+\s*$/, '')
  .trim();

function getMainMuscle(name, record) {
  const canon = getMuscleGroupsForExercise(name) || [];
  const fromLibrary = shortMuscle(record?.primary_muscle);
  const label = (fromLibrary && !/^none$/i.test(fromLibrary)) ? fromLibrary : (canon[0] || '');
  const thumb = canon[0] || parseMuscleText(label)[0] || null;
  return { label, thumb };
}

// "Busy? Try Pull-up · 76% match Swap ›" — one suggestion at a time; ›
// steps to the next of the (up to 3) options.
function BusyLine({ options }) {
  const [i, setI] = useState(0);
  const o = options[i % options.length];
  return (
    <div className="ect-note ect-busy">
      <b>Busy?</b>
      <span>
        Try {o.name} <span className="ect-dim">· {o.match}% match</span>
        <button type="button" className="ect-busy-swap" onClick={o.onSwap}>Swap</button>
        {options.length > 1 && (
          <button
            type="button"
            className="ect-busy-next"
            aria-label={`Next suggestion (${(i % options.length) + 1} of ${options.length})`}
            onClick={() => setI(n => n + 1)}
          >
            ›
          </button>
        )}
      </span>
    </div>
  );
}

export default function ExerciseCardTitle({ name, record, onShowGuide, onShowHistory, note, busy, children }) {
  const { label: muscle, thumb } = getMainMuscle(name, record);
  // A coach's own note on this plan exercise wins; otherwise every client
  // gets the written cue for the exercise (src/data/exerciseNotes.js).
  const shownNote = (note && String(note).trim()) || getExerciseNote(name);
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
        {busy && busy.length > 0 && <BusyLine options={busy} />}
        {shownNote && (
          <div className="ect-note">
            <b>Note</b>
            <span>{shownNote}</span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
