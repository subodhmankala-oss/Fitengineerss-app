import React, { useState } from 'react';
import databaseService from '../../services/databaseService';
import { notifyEvent } from '../../utils/pushNotify';

// Super-Admin: write a personal message to one client. Saved via the
// send_founder_message RPC (shows on their home screen / sign-up wizard as a
// FounderMessageCard with the founder's photo) and pushed to their phone
// (api/push.js founder_message).
export default function FounderMessageComposer({ client, onClose }) {
  const firstName = (client?.name || '').trim().split(/\s+/)[0];
  const [text, setText] = useState(firstName ? `Hi ${firstName}! ` : 'Hi! ');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const send = async () => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setError('');
    const res = await databaseService.sendFounderMessage(client.id, message);
    setSending(false);
    if (!res.success) {
      setError(res.error || 'Could not send. Try again.');
      return;
    }
    notifyEvent('founder_message', { clientUserId: client.id, message });
    setSent(true);
    setTimeout(onClose, 1200);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Message ${client?.name || 'client'}`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
        // Anchored to the top and scrollable: a vertically centred dialog
        // ends up behind the phone keyboard, so the text box can't be seen.
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px',
        overflowY: 'auto', WebkitOverflowScrolling: 'touch'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '440px', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px'
        }}
      >
        <h5 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>
          ✉️ Message {client?.name || 'client'}
        </h5>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Shows on their home screen with your photo, and goes to their phone if notifications are on. They can reply once.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          rows={4}
          disabled={sending || sent}
          aria-label="Message"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '10px',
            border: '1px solid var(--border-color)', background: 'rgba(var(--fg-rgb), 0.04)',
            color: 'var(--text-main)', fontSize: '16px', fontFamily: 'inherit', resize: 'vertical'
          }}
        />
        {error && <div style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '8px 14px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending || sent || !text.trim()}
            style={{
              background: 'var(--tint-violet, #8b5cf6)', border: 'none', color: '#fff', padding: '8px 16px',
              borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
              opacity: sending || !text.trim() ? 0.6 : 1
            }}
          >
            {sent ? 'Sent ✓' : sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
