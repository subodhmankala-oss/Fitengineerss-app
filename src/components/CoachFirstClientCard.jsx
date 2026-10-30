import React from 'react';
import { buildInviteShareText } from '../utils/inviteShare';

// Shown in place of the client list while a coach has no clients at all.
// Before this, a brand-new coach saw "No Clients Found — refine your search",
// a dead end that gave no hint that the Invite Clients card is how clients
// arrive. This card turns that blank space into the next action: a short
// checklist (each step ticks itself) and one big button that makes the invite
// code and then offers the WhatsApp share.
//
// Only the steps the dashboard can know without extra reads are listed: phone
// saved, invite code created, first client joined. Once a client exists the
// whole card goes away (the client list takes over).

function Step({ done, label }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: done ? 'var(--text-muted)' : 'var(--text-main)' }}>
      <span
        aria-hidden="true"
        style={{
          width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1.5px solid ${done ? 'var(--tint-emerald)' : 'var(--border-color)'}`,
          background: done ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
          color: 'var(--tint-emerald)'
        }}
      >
        {done && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span style={{ textDecoration: done ? 'line-through' : 'none' }}>{label}</span>
    </li>
  );
}

export default function CoachFirstClientCard({ phoneDone, inviteCode, codeCreated, generating, onCreateCode, coachName, origin }) {
  const steps = [
    { label: 'Add your phone number', done: phoneDone },
    { label: 'Create your invite code', done: codeCreated || !!inviteCode },
    { label: 'Share it with your first client', done: false },
    { label: 'Your client joins and shows up here', done: false }
  ];
  const doneCount = steps.filter(s => s.done).length;

  return (
    <div
      data-testid="coach-first-client-card"
      style={{
        border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 16px',
        margin: '8px 0', display: 'flex', flexDirection: 'column', gap: '14px',
        background: 'rgba(var(--fg-rgb), 0.02)'
      }}
    >
      <div>
        <h5 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', color: 'var(--text-main)' }}>Add your first client</h5>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Clients join with your invite code. Once one signs up, they appear here and you can build their plan.
        </p>
      </div>

      <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(var(--fg-rgb), 0.08)', overflow: 'hidden' }} aria-hidden="true">
        <div style={{ width: `${(doneCount / steps.length) * 100}%`, height: '100%', background: 'var(--tint-emerald)', transition: 'width 0.3s ease' }} />
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {steps.map(s => <Step key={s.label} done={s.done} label={s.label} />)}
      </ul>

      {inviteCode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
            padding: '10px 12px', borderRadius: '10px', border: '1px dashed var(--border-color)'
          }}>
            <strong style={{ letterSpacing: '2px', fontSize: '1.05rem', color: 'var(--text-main)' }}>{inviteCode}</strong>
            <button
              type="button"
              onClick={() => { try { navigator.clipboard.writeText(inviteCode); } catch { /* clipboard blocked */ } }}
              style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '6px', padding: '5px 10px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
            >
              Copy
            </button>
          </div>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(buildInviteShareText(coachName, origin, inviteCode))}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#25D366', color: '#fff', padding: '12px', borderRadius: '10px', textAlign: 'center',
              fontSize: '0.92rem', fontWeight: 700, textDecoration: 'none'
            }}
          >
            Share on WhatsApp
          </a>
        </div>
      ) : (
        <button
          type="button"
          onClick={onCreateCode}
          disabled={generating}
          style={{
            background: 'var(--primary-accent-light)', border: 'none', color: '#fff', padding: '12px',
            borderRadius: '10px', fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer', opacity: generating ? 0.6 : 1
          }}
        >
          {generating ? 'Creating…' : 'Create my invite code'}
        </button>
      )}
    </div>
  );
}
