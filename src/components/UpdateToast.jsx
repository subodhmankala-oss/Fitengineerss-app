import { useEffect, useState } from 'react';
import { applyPWAUpdate } from '../pwa/registerPWA';
import './UpdateToast.css';

// Floating toast that appears once a new deployment's service worker has
// finished downloading in the background. Refresh is opt-in: the user keeps
// working on the current version until they tap it, so nobody gets yanked
// mid-log. This is the whole "automatic update" flow — no reinstall, no
// app-store round trip, just a normal reload once they're ready.
export default function UpdateToast() {
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
    <div className="pwa-update-toast" role="status">
      <div className="pwa-update-toast__text">
        <strong>Update available</strong>
        <span>A new version of Fitengineers is ready.</span>
      </div>
      <button className="pwa-update-toast__btn" onClick={handleRefresh} disabled={applying}>
        {applying ? 'Updating…' : 'Refresh'}
      </button>
    </div>
  );
}
