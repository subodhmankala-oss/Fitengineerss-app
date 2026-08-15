import React, { useState, useEffect } from 'react';
import databaseService from '../services/databaseService';
import './WelcomeBanner.css';

// One-time "Welcome to Fitengineers" card on the client home screen — shown
// in-app rather than as a push notification (a push can be missed, silently
// denied by the browser, or arrive before the client has actually opened the
// dashboard once). Fires only for a genuinely brand-new client: the DB
// migration (sql/supabase_welcome_message.sql) backfills every EXISTING
// client's welcome_seen to true, so only signups from that point on start at
// false. Dismissing marks it seen server-side (same pattern as
// CoachNoteBanner/markCoachNoteRead) so it never resurfaces on another device
// or a later login — no auto-dismiss timer, stays until the client closes it
// themselves.
export default function WelcomeBanner({ userId, userName }) {
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    databaseService.getWelcomeSeen(userId).then((seen) => {
      if (!cancelled && !seen) setVisible(true);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const dismiss = async () => {
    if (dismissing) return;
    setDismissing(true);
    setVisible(false); // optimistic — don't make the client wait on the network to close it
    if (userId) databaseService.markWelcomeSeen(userId);
  };

  if (!visible) return null;

  const firstName = (userName || '').trim().split(/\s+/)[0] || 'there';

  return (
    <div className="welcome-banner">
      <div className="wb-icon">🎉</div>
      <div className="wb-body">
        <div className="wb-title">Welcome to Fitengineers, {firstName}!</div>
        <div className="wb-message">
          Your account is all set up. Let's get your first workout logged and start building momentum today. 💪
        </div>
      </div>
      <button
        type="button"
        className="wb-dismiss"
        onClick={dismiss}
        aria-label="Dismiss welcome message"
        title="Got it"
      >
        ✕
      </button>
    </div>
  );
}
