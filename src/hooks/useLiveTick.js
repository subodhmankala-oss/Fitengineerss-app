import { useEffect, useState } from 'react';

// Re-renders every `intervalMs` while `active`, so a clock whose value is
// derived from timestamps (session clock, set stopwatches, Clock popup)
// shows the current time. Returns a counter that changes on every tick, for
// callers that need to read Date.now() at render.
//
// Phones suspend setInterval while the app is off screen (locked, switched
// away, PWA backgrounded), and iOS can be slow to deliver it again once the
// app is back — the clock then sat on the last value it drew before leaving
// until the next tick finally ran. Coming back on screen (visibilitychange,
// pageshow for a restored page, focus) redraws at once and restarts the
// interval, so the displayed time catches up immediately.
export function useLiveTick(active, intervalMs = 1000) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return undefined;

    const bump = () => setTick((t) => t + 1);
    let id = setInterval(bump, intervalMs);
    const onBackOnScreen = () => {
      if (document.visibilityState !== 'visible') return;
      clearInterval(id);
      id = setInterval(bump, intervalMs);
      bump();
    };

    document.addEventListener('visibilitychange', onBackOnScreen);
    window.addEventListener('pageshow', onBackOnScreen);
    window.addEventListener('focus', onBackOnScreen);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onBackOnScreen);
      window.removeEventListener('pageshow', onBackOnScreen);
      window.removeEventListener('focus', onBackOnScreen);
    };
  }, [active, intervalMs]);

  return tick;
}
