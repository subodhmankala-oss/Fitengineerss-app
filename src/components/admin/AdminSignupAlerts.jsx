import React from 'react';

// In-app copy of the super-admin's sign-up alerts (api/_adminAlert.js writes
// one public.notifications row per alert, alongside the push). Shown at the
// top of the Super-Admin panel so an alert that was swiped away — or never
// delivered — is still here. Tapping opens the person; ✕ dismisses. Both
// mark the row read, which removes the card and the Admin toggle's dot.

const STYLE_BY_TYPE = {
  new_client_signup: { icon: '🎉', color: 'var(--tint-emerald)', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.25)', fallback: 'New client joined' },
  signup_incomplete: { icon: '⏸️', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.25)', fallback: 'Sign-up not finished' },
  new_coach_signup: { icon: '🏅', color: 'var(--tint-violet)', bg: 'rgba(139, 92, 246, 0.08)', border: 'rgba(139, 92, 246, 0.25)', fallback: 'New coach joined' },
  founder_reply: { icon: '💬', color: 'var(--tint-blue)', bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.25)', fallback: 'A client replied' }
};

function timeAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins || 1}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// onMessage (optional): opens the founder-message composer for the client
// an alert is about — not shown on coach alerts.
export default function AdminSignupAlerts({ alerts = [], onOpen, onDismiss, onDismissAll, onMessage }) {
  if (alerts.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h5 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 700 }}>
          🔔 Inbox ({alerts.length})
        </h5>
        {alerts.length > 1 && (
          <button
            type="button"
            onClick={onDismissAll}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Clear all
          </button>
        )}
      </div>
      {alerts.map(a => {
        const style = STYLE_BY_TYPE[a.type] || STYLE_BY_TYPE.new_client_signup;
        return (
          <div
            key={a.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(a)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(a); } }}
            style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px',
              background: style.bg, border: `1px solid ${style.border}`,
              borderRadius: '12px', padding: '12px 14px', cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0 }}>
              <span style={{ fontSize: '1.2rem' }}>{style.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: style.color }}>
                  {a.title || style.fallback}
                </div>
                {a.body && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', marginTop: '2px', overflowWrap: 'anywhere' }}>{a.body}</div>
                )}
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {timeAgo(a.createdAt)} · {a.type === 'new_coach_signup' ? 'Tap to see coaches' : 'Tap to open'}
                </div>
                {onMessage && a.type !== 'new_coach_signup' && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onMessage(a); }}
                    style={{
                      marginTop: '6px', background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.3)',
                      color: 'var(--tint-violet)', padding: '3px 10px', borderRadius: '6px', fontSize: '0.72rem',
                      fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
                    }}
                  >
                    ✉️ {a.type === 'founder_reply' ? 'Reply' : 'Message'}
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              title="Dismiss"
              aria-label="Dismiss"
              onClick={(e) => { e.stopPropagation(); onDismiss(a); }}
              style={{
                background: 'rgba(var(--fg-rgb), 0.06)', border: '1px solid var(--border-color)',
                color: 'var(--text-muted)', borderRadius: '50%', width: '26px', height: '26px',
                fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
