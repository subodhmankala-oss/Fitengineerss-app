import { useEffect, useState } from 'react';
import './InstallBanner.css';

// iOS has no beforeinstallprompt (see InstallBanner.jsx) — Safari is the
// only browser there that can add a site to the home screen, and it's a
// manual Share-sheet action with no programmatic trigger. This banner is
// the iOS-only nudge for that manual flow, shown once per snooze window so
// iPhone/iPad visitors don't have to stumble onto the notification-toggle
// hint in ClientProfile.jsx to learn the app is installable at all.
const DISMISS_KEY = 'fe_ios_install_banner_dismissed_until';
const SNOOZE_DAYS = 7;

function isDismissed() {
  const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return Date.now() < until;
}

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

// iPadOS 13+ reports as "Macintosh" with touch support, so the classic
// iPhone/iPad/iPod UA sniff alone misses iPads — the touch-point check
// catches those too.
function isIOSDevice() {
  const ua = navigator.userAgent;
  const isIPhoneFamily = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isIPadOS13Plus = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return isIPhoneFamily || isIPadOS13Plus;
}

// Chrome/Firefox/etc on iOS are still WebKit under the hood, but their
// Share sheet doesn't expose "Add to Home Screen" the way Safari's does —
// only Safari (and Safari-based in-app browsers count as Safari here) can
// actually install. Everything else needs to be told to switch browsers
// first.
function isIOSSafari() {
  const ua = navigator.userAgent;
  const isSafariEngine = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(ua);
  return isSafariEngine;
}

export default function IOSInstallBanner() {
  const [visible, setVisible] = useState(false);
  const [inOtherBrowser, setInOtherBrowser] = useState(false);

  useEffect(() => {
    if (!isIOSDevice() || isStandalone() || isDismissed()) return;
    setInOtherBrowser(!isIOSSafari());
    setVisible(true);
  }, []);

  if (!visible) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
    setVisible(false);
  };

  return (
    <div className="install-banner install-banner--ios" role="dialog" aria-label="Install FitEngineersss">
      <img className="install-banner__icon" src="/icons/icon-192.png" alt="" />
      <div className="install-banner__text">
        <strong>Install FitEngineersss</strong>
        <span>
          {inOtherBrowser
            ? 'Open this page in Safari, then tap Share → Add to Home Screen'
            : 'Tap Share ⬆️ below, then "Add to Home Screen"'}
        </span>
      </div>
      <div className="install-banner__actions">
        <button className="install-banner__dismiss" onClick={handleDismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
