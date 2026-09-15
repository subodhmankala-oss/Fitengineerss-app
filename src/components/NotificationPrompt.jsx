import React, { useState, useEffect } from 'react';
import databaseService from '../services/databaseService';
import { subscribeToPush } from '../utils/pushSubscription';
import './NotificationPrompt.css';

// One-time "Turn on notifications?" card shown to a brand-new client right
// after their first login, so they can opt in to workout reminders and
// coach notes without having to find the toggle buried in their profile
// settings first. Same reasoning as WelcomeBanner: tracked server-side (not
// localStorage), never re-prompted once answered on any device, and the DB
// migration (sql/supabase_notification_prompt.sql) backfills every EXISTING
// client to already-seen so only signups from that point on get asked.
//
// Never shown when there's nothing left to ask: unsupported browsers, or a
// permission the user already decided on (granted — nothing to do here, the
// separate self-heal in TrainerDashboard/ClientProfile keeps the underlying
// subscription alive; denied — the browser won't show a prompt again anyway,
// see pushSubscription.js for why that's a one-way door).
export default function NotificationPrompt({ userId, userName }) {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const supported = typeof window !== 'undefined' && 'Notification' in window;

  useEffect(() => {
    if (!userId || !supported || Notification.permission !== 'default') return;
    let cancelled = false;
    databaseService.getNotificationPromptSeen(userId).then((seen) => {
      if (!cancelled && !seen) setVisible(true);
    });
    return () => { cancelled = true; };
  }, [userId, supported]);

  const dismiss = () => {
    setVisible(false); // optimistic — don't make the client wait on the network to close it
    if (userId) databaseService.markNotificationPromptSeen(userId);
  };

  const enable = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      window.dispatchEvent(new Event('notificationPermissionChanged'));
      if (result === 'granted') {
        await subscribeToPush(userName);
      }
    } catch (e) {
      console.error('Notification permission request failed:', e);
    } finally {
      setRequesting(false);
      dismiss();
    }
  };

  if (!visible) return null;

  return (
    <div className="notif-prompt-banner">
      <div className="np-icon">🔔</div>
      <div className="np-body">
        <div className="np-title">Stay on track with notifications</div>
        <div className="np-message">
          Turn on notifications for workout reminders, coach notes, and daily nudges — you can change this later in your profile.
        </div>
        <div className="np-actions">
          <button
            type="button"
            className="np-enable"
            onClick={enable}
            disabled={requesting}
          >
            {requesting ? 'Enabling…' : 'Turn On'}
          </button>
          <button
            type="button"
            className="np-later"
            onClick={dismiss}
            disabled={requesting}
          >
            Not now
          </button>
        </div>
      </div>
      <button
        type="button"
        className="np-dismiss"
        onClick={dismiss}
        aria-label="Dismiss notification prompt"
        title="Not now"
        disabled={requesting}
      >
        ✕
      </button>
    </div>
  );
}
