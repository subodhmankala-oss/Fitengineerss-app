import React, { useState, useEffect } from 'react';
import { toWhatsappNumber, openWhatsapp } from '../utils/whatsappNudge';
import { QUIET_DAYS, RECAP_DAYS, getQuietClients, buildQuietMessage, summarizeRecentSessions } from '../utils/quietClients';
import { getLocalDateString, shiftLocalDateString } from '../utils/dateUtils';
import databaseService from '../services/databaseService';

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

// Whole-card collapse, remembered per device. Open by default.
const OPEN_KEY = 'coachQuietClientsOpen';
const readOpen = () => {
  try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; }
};
const writeOpen = (value) => {
  try { localStorage.setItem(OPEN_KEY, value ? '1' : '0'); } catch { /* not persisted */ }
};

export default function CoachQuietClients({ clients = [], onOpenClient }) {
  const [expanded, setExpanded] = useState(false);
  const [sent, setSent] = useState(readSent);
  const [open, setOpen] = useState(readOpen);
  const toggleOpen = () => setOpen(v => { writeOpen(!v); return !v; });

  const quiet = getQuietClients(clients);

  // Sessions the coach logged for each quiet client recently — a client the
  // coach trains in person rarely opens the app, so their message tells them
  // what's waiting there instead of "haven't seen you" (buildQuietMessage).
  const [recaps, setRecaps] = useState({});
  const quietIdsKey = quiet.map(q => q.client.id).join(',');
  useEffect(() => {
    if (!quietIdsKey) return undefined;
    let cancelled = false;
    const since = shiftLocalDateString(getLocalDateString(), -(RECAP_DAYS - 1));
    databaseService.getRecentWorkoutRowsForClients(quietIdsKey.split(','), since)
      .then(rows => { if (!cancelled) setRecaps(summarizeRecentSessions(rows)); })
      .catch(() => { /* recap is optional — falls back to the generic message */ });
    return () => { cancelled = true; };
  }, [quietIdsKey]);

  if (quiet.length === 0) return null;

  const coachName = (localStorage.getItem('userName') || '').trim();
  const coachBrand = (localStorage.getItem('userBrand') || 'Fitengineers').trim();
  const signOff = coachName ? `${coachName} · ${coachBrand}` : coachBrand;

  const isSent = (c) => sent[c.id] && sent[c.id].lastLogin === (c.last_login || null);
  const unsentCount = quiet.filter(({ client }) => !isSent(client)).length;

  const handleMessage = (client, days) => {
    openWhatsapp(toWhatsappNumber(client.phone), buildQuietMessage(client, days, signOff, recaps[client.id]));
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
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)'
        }}
      >
        <span>👀 {quiet.length} {quiet.length === 1 ? 'client has' : 'clients have'} gone quiet</span>
        <span aria-hidden="true" style={{
          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(245, 158, 11, 0.18)', color: '#f59e0b'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {open && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
        {unsentCount > 0
          ? `Inactive for ${QUIET_DAYS}+ days. A quick message from you usually brings them back.`
          : 'All messaged — they drop off this list once they open the app.'}
      </div>}

      {open && shown.map(({ client, days }) => {
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
                {recaps[client.id] && ` · ${recaps[client.id].sessions} session${recaps[client.id].sessions === 1 ? '' : 's'} in ${RECAP_DAYS} days`}
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

      {open && quiet.length > 3 && (
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
