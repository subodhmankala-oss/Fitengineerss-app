import React, { useState } from 'react';
import { toWhatsappNumber, openWhatsapp } from '../utils/whatsappNudge';
import { QUIET_DAYS, getQuietClients, buildQuietMessage } from '../utils/quietClients';

// Coach home card: "N clients have gone quiet". Lists the coach's own
// (un-paused) clients who haven't opened the app in QUIET_DAYS+ days, or
// never have, with a WhatsApp button that opens the chat with a check-in
// message already written and signed with the coach's name + brand.
//
// Same 3-day line as the daily "<client> has gone quiet" push
// (api/push.js runInactivitySweep), so the card and the push agree. Unlike
// the push, this also covers clients who never logged in — the sweep skips
// them, so nothing else ever surfaces them to the coach.
//
// "Messaged" ticks are per device and tied to the client's last_login at the
// time: once the client opens the app again they drop off the list, and if
// they go quiet again later the tick doesn't carry over.

const SENT_KEY = 'coachQuietClientsSent';

const readSent = () => {
  try { return JSON.parse(localStorage.getItem(SENT_KEY) || '{}') || {}; } catch { return {}; }
};
const writeSent = (value) => {
  try { localStorage.setItem(SENT_KEY, JSON.stringify(value)); } catch { /* private mode — ticks just won't persist */ }
};

export default function CoachQuietClients({ clients = [], onOpenClient }) {
  const [expanded, setExpanded] = useState(false);
  const [sent, setSent] = useState(readSent);

  const quiet = getQuietClients(clients);
  if (quiet.length === 0) return null;

  const coachName = (localStorage.getItem('userName') || '').trim();
  const coachBrand = (localStorage.getItem('userBrand') || 'Fitengineers').trim();
  const signOff = coachName ? `${coachName} · ${coachBrand}` : coachBrand;

  const isSent = (c) => sent[c.id] && sent[c.id].lastLogin === (c.last_login || null);
  const unsentCount = quiet.filter(({ client }) => !isSent(client)).length;

  const handleMessage = (client, days) => {
    openWhatsapp(toWhatsappNumber(client.phone), buildQuietMessage(client, days, signOff));
    setSent(prev => {
      const next = { ...prev, [client.id]: { at: new Date().toISOString(), lastLogin: client.last_login || null } };
      writeSent(next);
      return next;
    });
  };

  const shown = expanded ? quiet : quiet.slice(0, 3);

  return (
    <div style={{
      marginBottom: '16px', padding: '12px 14px', borderRadius: 'var(--radius-sm)',
      background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)',
      display: 'flex', flexDirection: 'column', gap: '8px'
    }}>
      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>
        👀 {quiet.length} {quiet.length === 1 ? 'client has' : 'clients have'} gone quiet
      </div>
      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
        {unsentCount > 0
          ? `Not in the app for ${QUIET_DAYS}+ days. A quick message from you usually brings them back.`
          : 'All messaged — they drop off this list once they open the app.'}
      </div>

      {shown.map(({ client, days }) => {
        const done = isSent(client);
        const hasPhone = !!toWhatsappNumber(client.phone);
        return (
          <div key={client.id} style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px',
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', opacity: done ? 0.65 : 1
          }}>
            <button
              type="button"
              onClick={() => onOpenClient?.(client)}
              style={{ minWidth: 0, flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {client.userName || client.email}
              </div>
              <div style={{ fontSize: '0.7rem', color: days === null ? 'var(--text-muted)' : '#f59e0b', fontWeight: 600 }}>
                {days === null ? "Hasn't opened the app yet" : `${days} days since last open`}
                {done && ' · ✓ messaged'}
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleMessage(client, days)}
              title={hasPhone ? undefined : 'No phone number saved — WhatsApp will ask who to send it to'}
              style={{
                background: done ? 'none' : '#25d366', border: done ? '1px solid var(--border-color)' : 'none',
                color: done ? 'var(--text-muted)' : '#fff', padding: '6px 12px', borderRadius: '6px',
                fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0
              }}
            >
              {done ? 'Again' : 'WhatsApp'}
            </button>
          </div>
        );
      })}

      {quiet.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {expanded ? 'Show less' : `Show all ${quiet.length}`}
        </button>
      )}
    </div>
  );
}
