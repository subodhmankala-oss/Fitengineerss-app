import { useEffect, useState } from 'react';
import './InstallBanner.css';

const DISMISS_KEY = 'fe_install_banner_dismissed_until';
const SNOOZE_DAYS = 7;

function isDismissed() {
  const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return Date.now() < until;
}

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS Safari
  );
}

// Android/desktop Chrome install banner. beforeinstallprompt never fires on
// iOS Safari (there's no programmatic install prompt there — see the
// separate "Add to Home Screen" instructions we give iOS users elsewhere),
// so on iOS this component simply never has anything to show.
export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    const onAppInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (!visible) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setInstalling(false);
    setDeferredPrompt(null);
    // Whether accepted or dismissed, the browser won't refire
    // beforeinstallprompt for a while either way — hide either way.
    setVisible(false);
    if (outcome === 'dismissed') {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
    setVisible(false);
  };

  return (
    <div className="install-banner" role="dialog" aria-label="Install FitEngineersss">
      <img className="install-banner__icon" src="/icons/icon-192.png" alt="" />
      <div className="install-banner__text">
        <strong>Install FitEngineersss</strong>
        <span>Faster, app-like experience</span>
      </div>
      <div className="install-banner__actions">
        <button className="install-banner__install" onClick={handleInstall} disabled={installing}>
          {installing ? 'Installing…' : 'Install App'}
        </button>
        <button className="install-banner__dismiss" onClick={handleDismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
