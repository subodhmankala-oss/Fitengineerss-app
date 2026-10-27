import React, { useEffect, useRef, useState } from 'react';
import { timeAgo } from '../utils/timeAgo';
import './CoachNotificationBell.css';

// Top-right notification inbox for the super-admin's desktop shell
// (2026-10-23: "I want the notifications which are missing ... so I can't
// miss the updates. And once I click on it I can do the action directly from
// there. Create only for me"). It invents no new data: every row is one of
// the dashboard's existing "something is waiting" lists (unread
// public.notifications rows, client replies, finished workouts with no coach
// note yet, new clients, renewals due) gathered into one place, each with
// the action that list already has — open the client on the right tab, send
// a note / reply inline, send the renewal reminder, dismiss. TrainerDashboard
// builds the items; this only renders them.
//
// item: { key, tone, icon, title, body, at, open?, actions?: [{ label, run }],
//         compose?: { label, placeholder, suggestions, send(text) -> bool },
//         dismiss? }

const ICONS = {
  reply: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
  workout: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  user: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></>,
  card: <><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></>,
  ruler: <><path d="M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4z" /><path d="m7.5 10.5 2 2" /><path d="m10.5 7.5 2 2" /><path d="m13.5 4.5 2 2" /></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>
};

function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name] || ICONS.bell}
    </svg>
  );
}

function BellItem({ item, onDone, onFlash }) {
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      const ok = await item.compose.send(message);
      if (ok) { setText(''); setComposing(false); onFlash(item.compose.flash || 'Sent'); }
      else onFlash("Couldn't send — try again", true);
    } finally {
      setSending(false);
    }
  };

  const openItem = () => { if (item.open) { item.open(); onDone(); } };

  return (
    <li className={`cnb-item cnb-tone-${item.tone || 'blue'}`}>
      <div className="cnb-row">
        <span className="cnb-icon"><Icon name={item.icon} /></span>
        <div
          className={`cnb-text${item.open ? ' cnb-clickable' : ''}`}
          role={item.open ? 'button' : undefined}
          tabIndex={item.open ? 0 : undefined}
          onClick={openItem}
          onKeyDown={(e) => { if (item.open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openItem(); } }}
        >
          <div className="cnb-title">{item.title}</div>
          {item.body && <div className="cnb-body">{item.body}</div>}
          {item.at && <div className="cnb-time">{timeAgo(item.at)}</div>}
        </div>
        {item.dismiss && (
          <button type="button" className="cnb-dismiss" title="Dismiss" aria-label="Dismiss" onClick={item.dismiss}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {(item.compose || item.open || item.actions?.length > 0) && !composing && (
        <div className="cnb-actions">
          {/* A one-tap action (e.g. Send reminder) leads; otherwise the composer does. */}
          {(item.actions || []).map((a, i) => (
            <button key={a.label} type="button" className={`cnb-btn${i === 0 ? ' cnb-btn-primary' : ''}`} onClick={() => { a.run(); if (a.flash) onFlash(a.flash); if (a.closes) onDone(); }}>
              {a.label}
            </button>
          ))}
          {item.compose && (
            <button type="button" className={`cnb-btn${!item.actions?.length ? ' cnb-btn-primary' : ''}`} onClick={() => setComposing(true)}>{item.compose.label}</button>
          )}
          {item.open && (
            <button type="button" className={`cnb-btn${!item.compose && !item.actions?.length ? ' cnb-btn-primary' : ''}`} onClick={openItem}>
              {item.openLabel || 'Open'}
            </button>
          )}
        </div>
      )}

      {composing && (
        <div className="cnb-compose">
          {item.compose.suggestions?.length > 0 && (
            <div className="cnb-chips">
              {item.compose.suggestions.map(s => (
                <button key={s} type="button" className="cnb-chip" onClick={() => setText(s)}>{s}</button>
              ))}
            </div>
          )}
          <textarea
            className="cnb-textarea"
            rows={3}
            autoFocus
            value={text}
            placeholder={item.compose.placeholder || 'Write a message…'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
          />
          <div className="cnb-actions">
            <button type="button" className="cnb-btn cnb-btn-primary" disabled={!text.trim() || sending} onClick={send}>
              {sending ? 'Sending…' : 'Send'}
            </button>
            <button type="button" className="cnb-btn" onClick={() => { setComposing(false); setText(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}

// variant: 'fixed' — top-right corner of the desktop shell; 'inline' — in the
// mobile header row, next to the profile photo. TrainerDashboard renders
// both; CSS shows whichever fits the width.
export default function CoachNotificationBell({ items = [], onClearAll, variant = 'fixed' }) {
  const [open, setOpen] = useState(false);
  // Short "Reminder sent" / "Couldn't send" line under the header — the
  // dashboard's own toast only shows on the home screen.
  const [flash, setFlash] = useState(null);
  const flashTimerRef = useRef(null);
  const showFlash = (message, isError = false) => {
    clearTimeout(flashTimerRef.current);
    setFlash({ message, isError });
    flashTimerRef.current = setTimeout(() => setFlash(null), 3000);
  };
  useEffect(() => () => clearTimeout(flashTimerRef.current), []);
  const rootRef = useRef(null);
  // Phone sheet starts just under the bell (2026-10-27: "It should start
  // from below the notification icon"), not under the role tabs that wrap
  // onto a second header row — so it's measured, not a fixed offset.
  const [sheetTop, setSheetTop] = useState(null);
  const toggle = () => {
    if (!open && variant === 'inline' && rootRef.current) {
      setSheetTop(Math.round(rootRef.current.getBoundingClientRect().bottom + 8));
    }
    setOpen(o => !o);
  };
  const sheetStyle = variant === 'inline' && sheetTop != null ? { top: sheetTop } : undefined;

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = items.length;
  return (
    <div className={`cnb-root cnb-${variant}`} ref={rootRef}>
      <button
        type="button"
        className={`cnb-bell${open ? ' cnb-bell-open' : ''}`}
        onClick={toggle}
        title={count ? `${count} update${count === 1 ? '' : 's'}` : 'No new updates'}
        aria-label={count ? `Notifications, ${count} new` : 'Notifications'}
        aria-expanded={open}
      >
        <Icon name="bell" size={variant === 'inline' ? 18 : 22} />
        {count > 0 && <span className="cnb-badge">{count > 99 ? '99+' : count}</span>}
      </button>

      {/* Dims the dashboard behind the list so it's obvious where the
          panel starts and ends (2026-10-27: on a phone the panel's cards and
          the dashboard's cards ran together). Tap it to close. */}
      {open && <div className="cnb-backdrop" style={sheetStyle} onClick={() => setOpen(false)} aria-hidden="true" />}

      {open && (
        <div className="cnb-panel" style={sheetStyle} role="dialog" aria-label="Notifications">
          <div className="cnb-head">
            <span className="cnb-head-title">Notifications</span>
            <div className="cnb-head-actions">
              {count > 1 && onClearAll && (
                <button type="button" className="cnb-clear" onClick={onClearAll}>Clear all</button>
              )}
              <button type="button" className="cnb-close" title="Close" aria-label="Close notifications" onClick={() => setOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          {flash && (
            <div className={`cnb-flash${flash.isError ? ' cnb-flash-error' : ''}`} role="status">{flash.message}</div>
          )}
          {count === 0 ? (
            <div className="cnb-empty">
              <Icon name="bell" size={28} />
              <div>You're all caught up.</div>
            </div>
          ) : (
            <ul className="cnb-list">
              {items.map(item => <BellItem key={item.key} item={item} onDone={() => setOpen(false)} onFlash={showFlash} />)}
              <li className="cnb-end" aria-hidden="true">End of notifications</li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
