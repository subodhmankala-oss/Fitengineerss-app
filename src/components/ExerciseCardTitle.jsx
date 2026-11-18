import React from 'react';
import MuscleThumbnail from './MuscleAnalytics/MuscleThumbnail';
import { getMuscleGroupsForExercise, parseMuscleText } from '../utils/muscleGroups';
import { getExerciseNote } from '../data/exerciseNotes';
import './ExerciseCardTitle.css';

// The exercise card's title block, shared by the client logger and the coach
// Live Log (they must match): a round muscle picture with a play badge that
// opens the Form Guide, the exercise name (tap = history), its equipment, and
// a Primary chip plus lighter Secondary chips. The card's ≡ menu stays beside
// it, unchanged.

const splitList = (text) => String(text || '')
  .split(/[,;]/)
  .map(s => s.trim())
  .filter(s => s && !/^none$/i.test(s));

function getExerciseMuscleLabels(name, record) {
  const canon = getMuscleGroupsForExercise(name) || [];
  let primary = splitList(record?.primary_muscle)[0] || '';
  let secondary = splitList(record?.secondary_muscle);
  if (!primary) {
    primary = canon[0] || '';
    secondary = canon.slice(1);
  }
  const seen = new Set([primary.toLowerCase()]);
  secondary = secondary.filter(m => !seen.has(m.toLowerCase()) && seen.add(m.toLowerCase()));
  const thumb = canon[0] || parseMuscleText(primary)[0] || null;
  return { primary, secondary: secondary.slice(0, 3), thumb };
}

export default function ExerciseCardTitle({ name, record, onShowGuide, onShowHistory, note, busy, children }) {
  const { primary, secondary, thumb } = getExerciseMuscleLabels(name, record);
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
        </div>
        {(primary || secondary.length > 0) && (
          <div className="ect-chips">
            {primary && <span className="ect-chip ect-chip--primary">{primary}</span>}
            {secondary.map(m => <span key={m} className="ect-chip">{m}</span>)}
          </div>
        )}
        {shownNote && (
          <div className="ect-note">
            <b>Note</b>
            <span>{shownNote}</span>
          </div>
        )}
        {busy && (
          <div className="ect-note ect-busy">
            <b>Busy?</b>
            <span>
              Try {busy.name} <span className="ect-dim">· {busy.match}% match</span>
              <button type="button" className="ect-busy-swap" onClick={busy.onSwap}>Swap</button>
            </span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
