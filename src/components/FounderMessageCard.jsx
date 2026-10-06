import React, { useState, useEffect } from 'react';
import databaseService from '../services/databaseService';
import { notifyEvent } from '../utils/pushNotify';
import './CoachNoteBanner.css';
import './FounderMessageCard.css';

// A personal message from the founder (sql/founder_messages.sql): the
// automatic welcome every new client gets, or one the founder wrote from
// Super-Admin. Shows the founder's Google photo + name, the message, and one
// reply slot — the reply goes to the founder as a push + an Inbox card in
// Super-Admin (api/push.js founder_reply). ✕ dismisses it on every device.
//
// Rendered on the client home screen only — not in the sign-up wizard, where
// it distracted from the form. `compact` (newest message only) is unused now.

function initials(name) {
  return (name || 'F').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function FounderAvatar({ name, url }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    // no-referrer: Google profile photos (lh3.googleusercontent.com) can
    // refuse hotlinked requests that carry a Referer.
    return <img className="fmc-avatar" src={url} alt={name} referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  }
  return <div className="fmc-avatar fmc-avatar-initials" aria-hidden="true">{initials(name)}</div>;
}

export default function FounderMessageCard({ compact = false }) {
  const [messages, setMessages] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [sendingId, setSendingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    databaseService.getMyFounderMessages().then((rows) => {
      if (!cancelled) setMessages(rows || []);
    });
    return () => { cancelled = true; };
  }, []);

  const dismiss = (m) => {
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    databaseService.dismissFounderMessage(m.id);
  };

  const sendReply = async (m) => {
    const reply = (drafts[m.id] || '').trim();
    if (!reply || sendingId) return;
    setSendingId(m.id);
    try {
      const res = await databaseService.replyToFounderMessage(m.id, reply);
      if (res.success) {
        notifyEvent('founder_reply', { clientUserId: m.clientId, message: reply });
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, clientReply: reply, clientReplyAt: new Date().toISOString() } : x)));
        setDrafts((prev) => { const next = { ...prev }; delete next[m.id]; return next; });
      }
    } finally {
      setSendingId(null);
    }
  };

  const shown = compact ? messages.slice(0, 1) : messages;
  if (shown.length === 0) return null;

  return (
    <div className={`coach-note-banner-stack${compact ? ' fmc-compact' : ''}`}>
      {shown.map((m) => (
        <div key={m.id} className="coach-note-banner founder-message-card">
          <FounderAvatar name={m.senderName} url={m.senderAvatarUrl} />
          <div className="cnb-body">
            <div className="fmc-sender">
              <span className="fmc-name">{m.senderName}</span>
              <span className="fmc-role">Founder, Fitengineers</span>
            </div>
            <div className="cnb-message">{m.message}</div>

            {m.clientReplyAt ? (
              <div className="cnb-reply-sent">✓ You replied: “{m.clientReply}” — {m.senderName.split(' ')[0]} will get back to you.</div>
            ) : (
              <div className="cnb-reply-row">
                <input
                  type="text"
                  className="cnb-reply-input"
                  placeholder={compact ? 'Stuck? Tell me what’s up…' : 'Need help? Reply here…'}
                  value={drafts[m.id] || ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendReply(m); }}
                  disabled={sendingId === m.id}
                  maxLength={500}
                  aria-label={`Reply to ${m.senderName}`}
                />
                <button
                  type="button"
                  className="cnb-reply-send"
                  disabled={sendingId === m.id || !(drafts[m.id] || '').trim()}
                  onClick={() => sendReply(m)}
                >
                  {sendingId === m.id ? '…' : 'Send'}
                </button>
              </div>
            )}
          </div>
          <button type="button" className="cnb-dismiss" onClick={() => dismiss(m)} aria-label="Dismiss message" title="Got it">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
