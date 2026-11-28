import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import databaseService from '../services/databaseService';
import { notifyEvent } from '../utils/pushNotify';
import { buildChatBubbles } from '../utils/teamChat';
import './TeamChat.css';

export function TeamLogo({ size = 28 }) {
  return (
    <span className="tc-logo" style={{ width: size, height: size }}>
      <img src="/logo.png" alt="" />
    </span>
  );
}

// Home header badge → this sheet. The client's chat with the Fitengineers
// team: the team intro, team messages from Super-Admin, and the client's own
// messages. Sending pushes the team (founder_reply → Super-Admin Inbox).
export default function TeamChatSheet({ userName, onClose, onRead }) {
  const [rows, setRows] = useState(undefined); // undefined = loading, null = failed
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    databaseService.getMyTeamChat().then((r) => {
      if (cancelled) return;
      setRows(r);
      if (r) { databaseService.markTeamChatRead(); onRead?.(); }
    });
    return () => { cancelled = true; };
  }, [onRead]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows]);

  const firstName = (userName || '').trim().split(/\s+/)[0] || 'there';
  const bubbles = buildChatBubbles(rows || []);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    const res = await databaseService.sendTeamMessage(text);
    setSending(false);
    if (!res.success) { setError(res.error); return; }
    if (res.clientId) notifyEvent('founder_reply', { clientUserId: res.clientId, message: text });
    setDraft('');
    const now = res.createdAt || new Date().toISOString();
    setRows(prev => [...(prev || []), { id: res.id || `local-${now}`, kind: 'client', message: '', clientReply: text, clientReplyAt: now, readAt: now, createdAt: now }]);
  };

  return createPortal(
    <div className="tc-backdrop" onClick={onClose}>
      <div className="tc-sheet" role="dialog" aria-modal="true" aria-labelledby="tc-title" onClick={e => e.stopPropagation()}>
        <div className="tc-grip" />
        <div className="tc-head">
          <TeamLogo size={34} />
          <div className="tc-head-text">
            <h3 id="tc-title" className="tc-title">Fitengineers team</h3>
            <p className="tc-sub">Real people, we reply personally</p>
          </div>
          <button type="button" className="tc-close" onClick={onClose} aria-label="Close chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="tc-list" ref={listRef}>
          <div className="tc-bubble tc-team">
            Hi {firstName}! Welcome to Fitengineers. If any exercise, set or screen is confusing, ask us here.
          </div>
          {rows === undefined && <div className="tc-note">Loading…</div>}
          {rows === null && <div className="tc-note">Couldn’t load your messages. You can still send one.</div>}
          {bubbles.map(b => (
            <div key={b.key} className={`tc-bubble ${b.from === 'me' ? 'tc-me' : 'tc-team'}`}>{b.text}</div>
          ))}
        </div>

        {error && <div className="tc-error" role="alert">{error}</div>}
        <div className="tc-input-row">
          <input
            type="text"
            className="tc-input"
            placeholder="Type your question…"
            value={draft}
            maxLength={1000}
            onChange={e => { setDraft(e.target.value); if (error) setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            aria-label="Message the Fitengineers team"
          />
          <button type="button" className="tc-send" onClick={send} disabled={sending || !draft.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
