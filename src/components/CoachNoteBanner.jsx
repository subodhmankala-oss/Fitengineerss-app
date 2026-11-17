import React, { useState, useEffect } from 'react';
import databaseService from '../services/databaseService';
import { notifyEvent } from '../utils/pushNotify';
import './CoachNoteBanner.css';

// Client-side fallback for a coach note: the note is delivered as a push the
// moment the coach sends it, but if the client missed or dismissed that push,
// their unread notes still surface here on the home screen. Dismissing a note
// marks it read so it stops resurfacing across devices.
//
// Drawn as a small chat thread so it reads as a message from a person: the
// coach's bubble on the left (initials + name + time), and once the client
// replies, their reply as a bubble on the right with "Delivered".
//
// Each note carries ONE reply slot: the client can send a single free-text
// (emoji included, just the native keyboard) message back on that specific
// note. Once client_reply_at is set, the composer for THAT note goes away —
// sending again requires a fresh note from the coach. The reply is pushed to
// the coach immediately (client_reply event) and also surfaces as a card on
// the coach's client-directory screen if they miss it.
// workout_date is a plain DATE column (e.g. "2026-01-05"); parse it as local
// (not UTC midnight) so the day shown always matches the day the coach picked.
function formatNoteDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// "9:41 AM" today, "Nov 16" before that — the timestamp a chat app would show.
function formatSentAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'C';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 14L21 3" /><path d="M21 3l-6.5 18a.55 .55 0 0 1-1 0L10 14l-7-3.5a.55 .55 0 0 1 0-1L21 3" />
  </svg>
);

const DeliveredIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 12l5 5L22 7" /><path d="M2 12l5 5M12 12l5-5" />
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export default function CoachNoteBanner({ userId, coachName }) {
  const [notes, setNotes] = useState([]);
  const [replyDrafts, setReplyDrafts] = useState({}); // { [noteId]: text }
  const [sendingReplyId, setSendingReplyId] = useState(null);

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

  const sendReply = async (note) => {
    const message = (replyDrafts[note.id] || '').trim();
    if (!message || sendingReplyId) return;
    setSendingReplyId(note.id);
    try {
      const res = await databaseService.saveClientReplyToNote(note.id, message);
      if (res.success) {
        // workoutName/workoutDate tell the coach's push WHICH session this
        // reply is about (api/push.js client_reply) — same context the
        // in-app pending-replies card shows.
        notifyEvent('client_reply', { clientUserId: userId, message, workoutName: note.workoutName, workoutDate: note.workoutDate });
        setNotes((prev) => prev.map((n) => (
          n.id === note.id ? { ...n, clientReply: message, clientReplyAt: new Date().toISOString() } : n
        )));
        setReplyDrafts((prev) => { const next = { ...prev }; delete next[note.id]; return next; });
      }
    } finally {
      setSendingReplyId(null);
    }
  };

  if (!notes || notes.length === 0) return null;

  const senderName = coachName ? `Coach ${coachName.trim().split(/\s+/)[0]}` : 'Your coach';

  return (
    <div className="coach-note-banner-stack">
      {notes.map((note) => {
        const draft = replyDrafts[note.id] || '';
        const sending = sendingReplyId === note.id;
        const sentAt = formatSentAt(note.createdAt);
        return (
          <div key={note.id} className="cnc-card" role="group" aria-label={`Message from ${senderName}`}>
            <button
              type="button"
              className="cnc-close"
              onClick={() => dismiss(note)}
              aria-label="Close message"
              title="Got it"
            >
              <CloseIcon />
            </button>

            <div className="cnc-row">
              <div className="cnc-avatar" aria-hidden="true">{initialsOf(coachName)}</div>
              <div className="cnc-col">
                <div className="cnc-meta">
                  <span className="cnc-sender">{senderName}</span>
                  {sentAt && <span className="cnc-time">{sentAt}</span>}
                </div>
                <div className="cnc-bubble cnc-bubble-in">{note.message}</div>
                {(note.workoutName || note.workoutDate) && (
                  <div className="cnc-context">
                    {note.workoutName || 'Workout'}
                    {note.workoutDate ? ` · ${formatNoteDate(note.workoutDate)}` : ''}
                  </div>
                )}
              </div>
            </div>

            {note.clientReplyAt ? (
              <div className="cnc-out">
                <div className="cnc-bubble cnc-bubble-out">{note.clientReply}</div>
                <div className="cnc-delivered">Delivered <DeliveredIcon /></div>
              </div>
            ) : (
              <form
                className="cnc-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  // The plane is always tappable; with an empty box it just
                  // puts the cursor in the box instead of doing nothing.
                  if (!draft.trim()) { document.getElementById(`cnc-input-${note.id}`)?.focus(); return; }
                  sendReply(note);
                }}
              >
                <input
                  type="text"
                  className="cnc-input"
                  id={`cnc-input-${note.id}`}
                  placeholder={`Message ${coachName ? senderName : 'your coach'}…`}
                  value={draft}
                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [note.id]: e.target.value }))}
                  disabled={sending}
                  maxLength={280}
                  enterKeyHint="send"
                  aria-label="Reply to your coach"
                />
                <button
                  type="submit"
                  className={`cnc-send${draft.trim() ? ' is-ready' : ''}`}
                  disabled={sending}
                  aria-label="Send reply"
                >
                  {sending ? <span className="cnc-spinner" aria-hidden="true" /> : <SendIcon />}
                </button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
