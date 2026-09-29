import React, { useState } from 'react';

const RPE_OPTIONS = [6, 7, 8, 9, 10];

// Per-exercise RPE + notes for the live loggers (client WorkoutTracker and
// coach Live Log). Collapsed by default so it never competes with the set
// rows; the toggle label shows what's filled in so a collapsed panel with
// content isn't mistaken for an empty one. Open/closed is local UI state —
// it follows the exercise row because each row is keyed by its item key.
export default function ExerciseRpeNotes({ rpe, notes, onChange }) {
  const [open, setOpen] = useState(false);
  const summary = [rpe ? `RPE ${rpe}` : null, notes?.trim() ? 'Note' : null].filter(Boolean).join(' · ');

  return (
    <div className="ex-rpe-notes">
      <button
        type="button"
        className="ex-rpe-notes-toggle"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span>{open ? '▾' : '▸'} RPE &amp; Notes</span>
        {summary && <span className="ex-rpe-notes-summary">{summary}</span>}
      </button>
      {open && (
        <div className="ex-rpe-notes-body">
          <div className="ex-rpe-chips" role="group" aria-label="Rate of perceived exertion">
            {RPE_OPTIONS.map(v => (
              <button
                key={v}
                type="button"
                className={`ex-rpe-chip ${Number(rpe) === v ? 'selected' : ''}`}
                aria-pressed={Number(rpe) === v}
                // Tapping the selected value again clears it.
                onClick={() => onChange('rpe', Number(rpe) === v ? null : v)}
              >
                {v}
              </button>
            ))}
          </div>
          <textarea
            className="ex-notes-input"
            rows={2}
            maxLength={500}
            placeholder="Notes (form cues, how it felt, pain…)"
            value={notes || ''}
            onChange={(e) => onChange('notes', e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
