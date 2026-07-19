import React, { useState, useEffect } from 'react';
import databaseService from '../services/databaseService';
import { notifyEvent } from '../utils/pushNotify';
import './CoachNoteBanner.css';

// Client-side fallback for a coach note: the note is delivered as a push the
// moment the coach sends it, but if the client missed or dismissed that push,
// their unread notes still surface here on the home screen. Dismissing a note
// marks it read so it stops resurfacing across devices.
//
// Each note also carries ONE reply slot: the client can send a single free-
// text (emoji included, just the native keyboard — no picker needed) message
// back on that specific note. Once client_reply_at is set, the reply box for
// THAT note locks — sending again requires a fresh note from the coach. The
// reply is pushed to the coach immediately (client_reply event) and also
// surfaces as a card on the coach's client-directory screen if they miss it.
export default function CoachNoteBanner({ userId }) {
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
        notifyEvent('client_reply', { clientUserId: userId, message });
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

  return (
    <div className="coach-note-banner-stack">
      {notes.map((note) => (
        <div key={note.id} className="coach-note-banner">
          <div className="cnb-icon">💬</div>
          <div className="cnb-body">
            <div className="cnb-label">Note from your coach</div>
            <div className="cnb-message">{note.message}</div>

            {note.clientReplyAt ? (
              <div className="cnb-reply-sent">✓ You replied: “{note.clientReply}”</div>
            ) : (
              <div className="cnb-reply-row">
                <input
                  type="text"
                  className="cnb-reply-input"
                  placeholder="Reply to your coach…"
                  value={replyDrafts[note.id] || ''}
                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [note.id]: e.target.value }))}
                  disabled={sendingReplyId === note.id}
                  maxLength={280}
                />
                <button
                  type="button"
                  className="cnb-reply-send"
                  disabled={sendingReplyId === note.id || !(replyDrafts[note.id] || '').trim()}
                  onClick={() => sendReply(note)}
                >
                  {sendingReplyId === note.id ? '…' : 'Send'}
                </button>
              </div>
            )}
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
