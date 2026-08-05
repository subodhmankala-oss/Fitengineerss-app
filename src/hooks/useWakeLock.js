import { useEffect, useRef } from 'react';

// Keeps the device screen from auto-locking/dimming while the app is open —
// mounted at the top level (App.jsx), active whenever `active` is true (the
// user is past login/onboarding and actually inside the app). Uses the
// Screen Wake Lock API, supported on modern Chrome/Edge/Safari (iOS 16.4+);
// on unsupported browsers this is a silent no-op — nothing else in the app
// depends on it.
//
// The browser itself releases a wake lock the moment the tab is hidden
// (backgrounded, phone locked, app-switched away), so this re-acquires on
// every 'visibilitychange' back to visible rather than trying to fight that
// — there's no way to keep the screen on while the tab isn't in front
// anyway, and re-requesting is exactly what the spec expects callers to do.
export function useWakeLock(active) {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let cancelled = false;

    const requestLock = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          // `active` flipped false or the effect re-ran while this was
          // in flight — release immediately instead of leaving a stray
          // lock held.
          lock.release().catch(() => {});
          return;
        }
        wakeLockRef.current = lock;
        lock.addEventListener('release', () => {
          if (wakeLockRef.current === lock) wakeLockRef.current = null;
        });
      } catch {
        // Permission denied, battery saver, or an unsupported context
        // (e.g. non-HTTPS in dev) — nothing else in the app depends on
        // this, so just leave the screen to behave normally.
      }
    };

    requestLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        requestLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [active]);
}
