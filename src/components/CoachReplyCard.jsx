import { useState } from 'react';
import './CoachHomeTop.css';

// Coach home: a client answered the coach's note. Reads like a chat — the
// coach's note on top, the client's reply in a bubble — with Reply (inline
// composer, same send path as the bell's Reply) and Open client.

const initialsOf = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export default function CoachReplyCard({ clientName, contextLabel, noteMessage, message, canOpen, onOpen, onDismiss, onSend }) {
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const firstName = (clientName || 'client').split(/\s+/)[0];

  const send = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      const ok = await onSend(msg);
      if (ok) { setText(''); setComposing(false); }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chr-reply">
      <div className="chr-reply-head">
        <span className="chr-avatar chr-avatar-violet" aria-hidden="true">{initialsOf(clientName)}</span>
        <div className="chr-reply-titles">
          <div className="chr-reply-title">{clientName || 'A client'} replied</div>
          {contextLabel && <div className="chr-reply-sub">{contextLabel}</div>}
        </div>
        <button type="button" className="chr-icon-btn" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="chr-reply-body">
        {noteMessage && <div className="chr-reply-note">You: {noteMessage}</div>}
        <div className="chr-reply-bubble">{message}</div>
        {composing ? (
          <div className="chr-reply-compose">
            <textarea
              className="chr-reply-input"
              rows={2}
              autoFocus
              placeholder={`Reply to ${firstName}…`}
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <div className="chr-reply-actions">
              <button type="button" className="chr-btn chr-btn-violet-solid" onClick={send} disabled={sending || !text.trim()}>
                {sending ? 'Sending…' : 'Send'}
              </button>
              <button type="button" className="chr-btn chr-btn-violet" onClick={() => { setComposing(false); setText(''); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="chr-reply-actions">
            <button type="button" className="chr-btn chr-btn-violet" onClick={() => setComposing(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              Reply
            </button>
            {canOpen && <button type="button" className="chr-btn chr-btn-violet" onClick={onOpen}>Open client</button>}
          </div>
        )}
      </div>
    </div>
  );
}
