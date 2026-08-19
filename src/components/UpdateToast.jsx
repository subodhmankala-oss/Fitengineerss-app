import { useEffect, useState } from 'react';
import { applyPWAUpdate } from '../pwa/registerPWA';
import { hardRefresh } from '../pwa/hardRefresh';
import './UpdateToast.css';

// Floating toast that appears the moment a new deployment's service worker
// has finished downloading in the background. POLICY CHANGE 2026-08-18:
// refresh used to be opt-in (the user stayed on the current version until
// they tapped it) — that left every fix's rollout dependent on someone
// noticing and tapping a toast, which in practice often never happened (see
// registerPWA.js's onNeedRefresh for the full writeup). The update is now
// applied automatically the instant it's found — this toast is purely
// informational, so a reload that's about to happen isn't a total surprise.
// The button is a manual "do it now" in case the automatic reload (which
// waits on a controllerchange event) is slow to land.
export default function UpdateToast() {
  const [visible, setVisible] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const onNeedRefresh = () => { setVisible(true); setApplying(true); };
    window.addEventListener('pwa:need-refresh', onNeedRefresh);
    return () => window.removeEventListener('pwa:need-refresh', onNeedRefresh);
  }, []);

  if (!visible) return null;

  // Escalated 2026-08-19 from applyPWAUpdate() alone. That activates the
  // waiting worker and reloads, which correctly swaps the JS/CSS bundles —
  // but the reload is still served by the service worker, so a precached
  // index.html can survive it. Anything living in the document head
  // (viewport / viewport-fit, iOS status bar style, theme-color) therefore
  // stayed on the old build's values no matter how many times this was
  // tapped, and the only known escape was deleting and re-adding the app
  // from the home screen. hardRefresh() drops the caches and unregisters
  // the workers first, so the document itself comes from the network.
  const handleRefresh = async () => {
    setApplying(true);
    const result = await hardRefresh();
    if (!result.ok) {
      // Offline: the waiting worker is still a strictly newer build than
      // what's running, so fall back to the plain swap rather than leaving
      // the user on a stale version with a dead button.
      applyPWAUpdate();
    }
  };

  return (
    <div className="pwa-update-toast" role="status">
      <div className="pwa-update-toast__text">
        <strong>Updating Fitengineers</strong>
        <span>A newer version was found — reloading automatically, your progress is saved.</span>
      </div>
      <button className="pwa-update-toast__btn" onClick={handleRefresh} disabled={applying}>
        {applying ? 'Updating…' : 'Reload now'}
      </button>
    </div>
  );
}
