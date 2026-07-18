import React, { useState, useEffect } from 'react';
import databaseService from '../services/databaseService';
import './CoachNoteBanner.css';

// Client-side fallback for a coach note: the note is delivered as a push the
// moment the coach sends it, but if the client missed or dismissed that push,
// their unread notes still surface here on the home screen. Dismissing a note
// marks it read so it stops resurfacing across devices. This is a one-way
// display (not a chat) — there's no reply here by design.
export default function CoachNoteBanner({ userId }) {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    databaseService.getUnreadCoachNotes(userId).then((rows) => {
      if (!cancelled) setNotes(rows || []);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const dismiss = async (note) => {
    // Optimistically remove; persist the read state so it won't come back.
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    if (note.id) databaseService.markCoachNoteRead(note.id);
  };

  if (!notes || notes.length === 0) return null;

  return (
    <div className="coach-note-banner-stack">
      {notes.map((note) => (
        <div key={note.id} className="coach-note-banner">
          <div className="cnb-icon">💬</div>
          <div className="cnb-body">
            <div className="cnb-label">Note from your coach</div>
            <div className="cnb-message">{note.message}</div>
          </div>
          <button
            type="button"
            className="cnb-dismiss"
            onClick={() => dismiss(note)}
            aria-label="Dismiss note"
            title="Got it"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
