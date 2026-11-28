import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import databaseService from '../services/databaseService';
import { subscribeToPush } from '../utils/pushSubscription';
import { TeamLogo } from './TeamChatSheet';
import { notifPermission, enableStepsFor } from '../utils/notifPermission';
import './TeamChat.css';

// Client Home pop-ups, instead of three stacked cards:
//   1. Welcome from the Fitengineers team — once, clients.welcome_seen.
//   2. Notifications — COMPULSORY. Shown on every open while the phone can do
//      notifications but they aren't allowed. No "Maybe later":
//      Always opens on "Turn on notifications" (one button). Tapping it shows
//      the phone's Allow prompt; if the phone is blocked (now or after they
//      tap Block) it switches to settings steps + "Check again", and re-checks
//      on return to the app.
//      Skipped only when the browser can't do notifications at all (e.g. an
//      iPhone that hasn't added the app to the Home Screen) — nothing to allow.
const ICONS = {
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M16 3v4M8 3v4M4 11h16M11 15h1v3" /></>,
  message: <><path d="M8 9h8M8 13h6" /><path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-5l-5 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" /></>,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10M17 4v8a5 5 0 0 1-10 0V4" /><path d="M5 9a2 2 0 1 1 0-4h2M19 9a2 2 0 1 0 0-4h-2" /></>,
  bell: <><path d="M10 5a2 2 0 1 1 4 0 7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" /></>,
  bellOff: <><path d="M9.35 5.35A2 2 0 0 1 14 5a7 7 0 0 1 4 6v3m-1 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 1.3-4.1" /><path d="M9 17v1a3 3 0 0 0 6 0v-1M3 3l18 18" /></>,
  arrow: <path d="M5 12h14M13 18l6-6M13 6l6 6" />,
};
const Icon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
);

const SNOOZE_KEY = 'notifPopupSnoozed';

export default function WelcomePopups({ userId, userName }) {
  const [welcome, setWelcome] = useState(false);
  const [perm, setPerm] = useState(notifPermission);
  const [requesting, setRequesting] = useState(false);
  const [checked, setChecked] = useState(false); // "Check again" found it still off
  // Every client first sees "Turn on notifications"; the settings steps only
  // appear after they tap it and the phone turns out to be blocked.
  const [showSteps, setShowSteps] = useState(false);
  // Escape hatch on the blocked screen only: some browsers (in-app browsers,
  // locked-down phones) can never allow notifications, and a strict pop-up
  // would lock those clients out. "Not now" lets them in for this visit;
  // sessionStorage clears when the app is closed, so it asks again next open.
  const [snoozed, setSnoozed] = useState(() => {
    try { return sessionStorage.getItem(SNOOZE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    databaseService.getWelcomeSeen(userId).then((seen) => { if (!cancelled && !seen) setWelcome(true); });
    return () => { cancelled = true; };
  }, [userId]);

  const granted = useCallback(() => {
    subscribeToPush(userName);
    databaseService.markNotificationPromptSeen(userId);
    window.dispatchEvent(new Event('notificationPermissionChanged'));
  }, [userId, userName]);

  // Coming back from phone settings: re-read the permission.
  const recheck = useCallback(() => {
    const p = notifPermission();
    if (p === 'granted' && perm !== 'granted') granted();
    setPerm(p);
    return p;
  }, [perm, granted]);

  useEffect(() => {
    if (perm === 'granted' || perm === 'unsupported') return;
    const onVis = () => { if (document.visibilityState === 'visible') recheck(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', recheck);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', recheck);
    };
  }, [perm, recheck]);

  const askPermission = async () => {
    if (requesting) return;
    // Already blocked: the phone won't show its Allow prompt, so go straight
    // to the settings steps.
    if (notifPermission() === 'denied') { setShowSteps(true); recheck(); return; }
    setRequesting(true);
    try {
      await Notification.requestPermission();
    } catch (e) {
      console.error('Notification permission request failed:', e);
    } finally {
      setRequesting(false);
      if (recheck() === 'denied') setShowSteps(true);
    }
  };

  const checkAgain = () => { setChecked(recheck() !== 'granted'); };

  const needNotif = (perm === 'default' || perm === 'denied') && !snoozed;
  const step = welcome ? 'welcome' : needNotif ? 'notif' : null;
  if (!step) return null;

  const firstName = (userName || '').trim().split(/\s+/)[0] || 'there';
  const dots = welcome && needNotif && (
    <div className="wp-dots" aria-hidden="true">
      <span className={step === 'welcome' ? 'on' : ''} /><span className={step === 'notif' ? 'on' : ''} />
    </div>
  );

  let body;
  if (step === 'welcome') {
    body = (
      <>
        <TeamLogo size={56} />
        <h3 id="wp-title" className="wp-title">Welcome, {firstName}</h3>
        <p className="wp-text">We’re the Fitengineers team. We built this app to coach you through every workout, step by step.</p>
        <p className="wp-text">Stuck anytime? Tap our logo at the top of Home and message us. We read every one.</p>
        {dots}
        <button type="button" className="wp-primary" onClick={() => { databaseService.markWelcomeSeen(userId); setWelcome(false); }}>
          Let’s go <Icon name="arrow" size={16} />
        </button>
      </>
    );
  } else if (!showSteps) {
    body = (
      <>
        <span className="wp-bell"><Icon name="bell" size={26} /></span>
        <h3 id="wp-title" className="wp-title">Turn on notifications</h3>
        <p className="wp-text">Fitengineers needs notifications to coach you.</p>
        <ul className="wp-reasons">
          <li><Icon name="calendar" /> Reminder on your workout days</li>
          <li><Icon name="message" /> Notes from your coach and our team</li>
          <li><Icon name="trophy" /> New personal bests</li>
        </ul>
        {dots}
        <button type="button" className="wp-primary" onClick={askPermission} disabled={requesting}>
          {requesting ? 'Waiting for your answer…' : 'Turn on notifications'}
        </button>
        <p className="wp-hint">On the next prompt, tap Allow.</p>
      </>
    );
  } else {
    body = (
      <>
        <span className="wp-bell wp-bell-off"><Icon name="bellOff" size={26} /></span>
        <h3 id="wp-title" className="wp-title">Notifications are blocked</h3>
        <p className="wp-text">Fitengineers needs notifications to coach you. Turn them on in your phone:</p>
        <ol className="wp-steps">
          {enableStepsFor().map((s, i) => <li key={i}><span className="wp-num">{i + 1}</span>{s}</li>)}
        </ol>
        <button type="button" className="wp-primary" onClick={checkAgain}>Check again</button>
        {checked && <p className="wp-hint wp-hint-warn" role="status">Still off. Follow the steps above, then come back.</p>}
        <button
          type="button"
          className="wp-later"
          onClick={() => { try { sessionStorage.setItem(SNOOZE_KEY, '1'); } catch { /* private mode */ } setSnoozed(true); }}
        >
          Not now
        </button>
      </>
    );
  }

  return createPortal(
    <div className="wp-backdrop">
      <div className="wp-card" role="dialog" aria-modal="true" aria-labelledby="wp-title" key={`${step}-${perm}`}>
        {body}
      </div>
    </div>,
    document.body
  );
}
