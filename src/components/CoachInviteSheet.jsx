import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildInviteShareText } from '../utils/inviteShare';
import './CoachHomeTop.css';

// Bottom sheet behind the coach home's Invite button (2026-11-17): the
// button makes the code the first time it's tapped in a session; the sheet
// shows it big with
// the three steps the client follows and WhatsApp / Copy / Share. "Make a new
// code" keeps the old confirm — the previous code stops working.

export default function CoachInviteSheet({ open, onClose, code, generating, onGenerate, coachName, origin }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => { if (!copied) return undefined; const t = setTimeout(() => setCopied(false), 1800); return () => clearTimeout(t); }, [copied]);

  if (!open) return null;

  const shareText = code ? buildInviteShareText(coachName, origin, code) : '';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); } catch { /* clipboard blocked */ }
  };
  const share = async () => {
    try { await navigator.share({ text: shareText }); } catch { /* cancelled */ }
  };
  const regenerate = () => {
    if (window.confirm('Make a new code? Your current code will stop working for anyone who hasn\'t used it yet.')) onGenerate();
  };

  return createPortal(
    <div className="chr-sheet-backdrop" onClick={onClose}>
      <div className="chr-sheet" role="dialog" aria-modal="true" aria-label="Invite a client" onClick={e => e.stopPropagation()}>
        <div className="chr-sheet-grip" aria-hidden="true" />
        <div className="chr-sheet-head">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="chr-teal-ink">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" />
          </svg>
          <span className="chr-sheet-title">Invite a client</span>
          <button type="button" className="chr-icon-btn" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="chr-code-box">
          <div className="chr-code-label">Your invite code</div>
          <div className={`chr-code${code ? '' : ' is-wait'}`}>{code || (generating ? 'Making…' : '—')}</div>
        </div>

        <ol className="chr-steps">
          <li><span>1</span>Client opens the app and signs up</li>
          <li><span>2</span>Enters this code</li>
          <li><span>3</span>They appear in your client list</li>
        </ol>

        <a
          className={`chr-sheet-btn chr-sheet-btn-wa${code ? '' : ' is-off'}`}
          href={code ? `https://wa.me/?text=${encodeURIComponent(shareText)}` : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!code}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21l1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" /></svg>
          Send on WhatsApp
        </a>
        <div className="chr-sheet-row">
          <button type="button" className="chr-sheet-btn" onClick={copy} disabled={!code}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
            {copied ? 'Copied' : 'Copy'}
          </button>
          {canShare && (
            <button type="button" className="chr-sheet-btn" onClick={share} disabled={!code}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="12" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4" /></svg>
              Share
            </button>
          )}
        </div>
        {code && (
          <button type="button" className="chr-sheet-link" onClick={regenerate} disabled={generating}>
            Make a new code (old one stops working)
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
