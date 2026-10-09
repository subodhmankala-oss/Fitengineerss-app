import React, { useState } from 'react';
import { APP_LINK, toWhatsappNumber, isFounderAudience, buildNudgeMessage, openWhatsapp } from '../../utils/whatsappNudge';

// "WhatsApp these clients as the Fitengineers team" for the admin Clients
// tab's 6+ days inactive / Never logged in tiles. Only people the founder is
// responsible for get messaged: Self-Guided clients (no coach) and clients
// of the founder's own coach account. Other coaches' clients are left to
// their coach.
//
// There is no WhatsApp API behind this — each Send opens WhatsApp with the
// number and the message already filled in, and the admin taps send there.
// Sent ticks are remembered per device so the list can be worked through
// over several sittings.

const DRAFT_KEY = 'adminWhatsappNudgeDraft';
const SENT_KEY = 'adminWhatsappNudgeSent';

const readStore = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const writeStore = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode — ticks just won't persist */ }
};

const DEFAULT_DRAFT = 'Hi {name}! 👋 It\'s the Fitengineers team. We noticed you haven\'t opened the app in a while — your plan is waiting for you. Tap the link below to jump back in.';

export default function AdminWhatsappNudge({ clients = [], coachesList = [], tileLabel }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => readStore(DRAFT_KEY, DEFAULT_DRAFT));
  const [sent, setSent] = useState(() => readStore(SENT_KEY, {}));

  const audience = clients.filter(c => isFounderAudience(c, coachesList));
  const reachable = audience.filter(c => toWhatsappNumber(c.phone));
  const noPhone = audience.length - reachable.length;
  const sentCount = reachable.filter(c => sent[c.id]).length;

  const updateDraft = (value) => { setDraft(value); writeStore(DRAFT_KEY, value); };
  const markSent = (id, value) => {
    setSent(prev => {
      const next = { ...prev };
      if (value) next[id] = new Date().toISOString(); else delete next[id];
      writeStore(SENT_KEY, next);
      return next;
    });
  };

  const handleSend = (client) => {
    openWhatsapp(toWhatsappNumber(client.phone), buildNudgeMessage(draft, client));
    markSent(client.id, true);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left',
          margin: '0 0 10px 0', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: '0.82rem', fontWeight: 700, color: '#16a34a',
          background: 'rgba(37, 211, 102, 0.08)', border: '1px solid rgba(37, 211, 102, 0.3)'
        }}
      >
        💬 WhatsApp these as Fitengineers team
        <span style={{ marginLeft: 'auto', fontWeight: 600, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          {reachable.length} {reachable.length === 1 ? 'client' : 'clients'}
        </span>
      </button>
    );
  }

  return (
    <div style={{
      margin: '0 0 12px 0', padding: '12px', borderRadius: '10px',
      background: 'rgba(37, 211, 102, 0.05)', border: '1px solid rgba(37, 211, 102, 0.3)',
      display: 'flex', flexDirection: 'column', gap: '10px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <strong style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>💬 WhatsApp — {tileLabel}</strong>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '3px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Close
        </button>
      </div>
      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
        Self-Guided clients and your own clients only — other coaches' clients are left out.
        {noPhone > 0 && ` ${noPhone} skipped (no phone number).`}
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)' }}>
        Message ({'{name}'} = first name, app link is added at the end)
        <textarea
          value={draft}
          onChange={(e) => updateDraft(e.target.value)}
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 400, resize: 'vertical' }}
        />
      </label>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        Link sent: <span style={{ color: 'var(--text-main)' }}>{APP_LINK}</span>
      </div>

      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-main)' }}>
        {sentCount} of {reachable.length} sent
        {sentCount > 0 && (
          <button
            type="button"
            onClick={() => reachable.forEach(c => markSent(c.id, false))}
            style={{ marginLeft: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
          >
            Clear ticks
          </button>
        )}
      </div>

      {reachable.length === 0 ? (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No one to message here.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {reachable.map(client => {
            const isSent = !!sent[client.id];
            return (
              <div key={client.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', opacity: isSent ? 0.6 : 1 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {client.userName || client.email}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {client.phone} · {client.coach_id ? 'Your client' : 'Self-Guided'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSend(client)}
                  disabled={!draft.trim()}
                  style={{
                    background: isSent ? 'none' : '#25d366', border: isSent ? '1px solid var(--border-color)' : 'none',
                    color: isSent ? 'var(--text-muted)' : '#fff', padding: '5px 12px', borderRadius: '6px',
                    fontSize: '0.74rem', fontWeight: 700, cursor: draft.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', flexShrink: 0
                  }}
                >
                  {isSent ? '✓ Sent · again' : 'Send'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
