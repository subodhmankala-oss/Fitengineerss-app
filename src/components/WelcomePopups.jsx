import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import databaseService from '../services/databaseService';
import { subscribeToPush } from '../utils/pushSubscription';
import { TeamLogo } from './TeamChatSheet';
import './TeamChat.css';

// First open after sign-up: two pop-ups, one after the other, instead of three
// cards stacked on Home (welcome, notifications, founder message).
//   1. Welcome from the Fitengineers team  — clients.welcome_seen
//   2. Turn on notifications               — clients.notification_prompt_seen
// Each flag is server-side, so neither returns on another device. Step 2 is
// skipped when the browser can't do notifications or the client already
// allowed / blocked them (a blocked prompt can't be shown again anyway).
const notifAskable = () => typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default';

const ICONS = {
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M16 3v4M8 3v4M4 11h16M11 15h1v3" /></>,
  message: <><path d="M8 9h8M8 13h6" /><path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-5l-5 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" /></>,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10M17 4v8a5 5 0 0 1-10 0V4" /><path d="M5 9a2 2 0 1 1 0-4h2M19 9a2 2 0 1 0 0-4h-2" /></>,
  bell: <><path d="M10 5a2 2 0 1 1 4 0 7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" /></>,
  arrow: <path d="M5 12h14M13 18l6-6M13 6l6 6" />,
};
const Icon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
);

export default function WelcomePopups({ userId, userName }) {
  const [steps, setSteps] = useState([]); // e.g. ['welcome', 'notif']
  const [idx, setIdx] = useState(0);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const askNotif = notifAskable();
    Promise.all([
      databaseService.getWelcomeSeen(userId),
      askNotif ? databaseService.getNotificationPromptSeen(userId) : Promise.resolve(true),
    ]).then(([welcomeSeen, notifSeen]) => {
      if (cancelled) return;
      const s = [];
      if (!welcomeSeen) s.push('welcome');
      if (!notifSeen && notifAskable()) s.push('notif');
      setSteps(s);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const step = steps[idx];
  if (!step) return null;
  const next = () => setIdx(i => i + 1);

  const finishWelcome = () => {
    databaseService.markWelcomeSeen(userId);
    next();
  };

  const closeNotif = () => {
    databaseService.markNotificationPromptSeen(userId);
    next();
  };

  const enableNotif = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      window.dispatchEvent(new Event('notificationPermissionChanged'));
      if (result === 'granted') await subscribeToPush(userName);
    } catch (e) {
      console.error('Notification permission request failed:', e);
    } finally {
      setRequesting(false);
      closeNotif();
    }
  };

  const firstName = (userName || '').trim().split(/\s+/)[0] || 'there';
  const dots = steps.length > 1 && (
    <div className="wp-dots" aria-hidden="true">
      {steps.map((s, i) => <span key={s} className={i === idx ? 'on' : ''} />)}
    </div>
  );

  return createPortal(
    <div className="wp-backdrop">
      <div className="wp-card" role="dialog" aria-modal="true" aria-labelledby="wp-title" key={step}>
        {step === 'welcome' ? (
          <>
            <TeamLogo size={56} />
            <h3 id="wp-title" className="wp-title">Welcome, {firstName}</h3>
            <p className="wp-text">We’re the Fitengineers team. We built this app to coach you through every workout, step by step.</p>
            <p className="wp-text">Stuck anytime? Tap our logo at the top of Home and message us. We read every one.</p>
            {dots}
            <button type="button" className="wp-primary" onClick={finishWelcome}>
              Let’s go <Icon name="arrow" size={16} />
            </button>
          </>
        ) : (
          <>
            <span className="wp-bell"><Icon name="bell" size={26} /></span>
            <h3 id="wp-title" className="wp-title">Never miss a training day</h3>
            <ul className="wp-reasons">
              <li><Icon name="calendar" /> Reminder on your workout days</li>
              <li><Icon name="message" /> Notes from your coach and our team</li>
              <li><Icon name="trophy" /> New personal bests</li>
            </ul>
            {dots}
            <button type="button" className="wp-primary" onClick={enableNotif} disabled={requesting}>
              {requesting ? 'Turning on…' : 'Turn on notifications'}
            </button>
            <button type="button" className="wp-later" onClick={closeNotif} disabled={requesting}>Maybe later</button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
