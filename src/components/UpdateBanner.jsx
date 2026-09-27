import { useEffect, useState } from 'react';
import { applyPWAUpdate } from '../pwa/registerPWA';
import './UpdateBanner.css';

// Top-of-screen "new version available" banner, shown whenever a newer
// deployment's service worker has finished downloading in the background.
//
// Refresh applies it now. Dismissing (or just ignoring) it is safe: the
// update is applied automatically the next time the app goes into the
// background (see registerPWA.js's UPDATE POLICY note), so nobody is left on
// an old build. That fallback is what makes an opt-in banner acceptable
// again — the 2026-08-18 policy reloaded instantly because the previous
// opt-in toast was routinely ignored and devices ran buggy builds for days.
export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const onNeedRefresh = () => setVisible(true);
    window.addEventListener('pwa:need-refresh', onNeedRefresh);
    return () => window.removeEventListener('pwa:need-refresh', onNeedRefresh);
  }, []);

  if (!visible) return null;

  const handleRefresh = () => {
    setApplying(true);
    applyPWAUpdate();
  };

  return (
    <div className="pwa-update-banner" role="status">
      <p className="pwa-update-banner__text">
        The newest version of Fitengineers is now available! Refresh for the latest updates.
      </p>
      <div className="pwa-update-banner__actions">
        <button
          type="button"
          className="pwa-update-banner__refresh"
          onClick={handleRefresh}
          disabled={applying}
        >
          <svg
            className={applying ? 'pwa-update-banner__icon is-spinning' : 'pwa-update-banner__icon'}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          {applying ? 'Refreshing…' : 'Refresh'}
        </button>
        <span className="pwa-update-banner__divider" aria-hidden="true" />
        <button
          type="button"
          className="pwa-update-banner__close"
          onClick={() => setVisible(false)}
          aria-label="Dismiss update notice"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
