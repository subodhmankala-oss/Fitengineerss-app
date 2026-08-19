import { useEffect, useState } from 'react';
import { applyPWAUpdate } from '../pwa/registerPWA';
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

  const handleRefresh = () => {
    setApplying(true);
    applyPWAUpdate();
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
