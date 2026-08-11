// Central place that talks to the service worker. Kept out of main.jsx so
// the update/offline signals are easy to reuse from any component via plain
// DOM CustomEvents (no extra state library needed for two booleans).
import { registerSW } from 'virtual:pwa-register';

let applyUpdateFn = null;
// True until the first onNeedRefresh has been handled. registerSW's default
// update check only fires on page load/navigation — a client who opens the
// app once and leaves it running for days (the normal case for a PWA
// someone doesn't consciously "quit") never re-checks, so a shipped fix
// could sit undelivered on their device indefinitely with only a toast they
// may never notice as the sole path to actually getting it. Confirmed
// 2026-08-11: a real client's workout logging bug was already fixed and
// deployed, but their device was still silently running the pre-fix build.
let appJustLaunched = true;
setTimeout(() => { appJustLaunched = false; }, 5000);

export function initPWA() {
  if (!('serviceWorker' in navigator)) return;

  applyUpdateFn = registerSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      // Check for a newer deploy periodically while the app stays open, not
      // just on the initial page load — closes the exact gap above for a
      // long-running session. Errors here are non-fatal; the next interval
      // just tries again.
      setInterval(() => {
        registration.update().catch(() => {});
      }, 5 * 60 * 1000);
    },
    onNeedRefresh() {
      // A new SW finished installing and is waiting. If this fires within
      // the first few seconds of launch, there's nothing "mid-log" to
      // protect yet — the client hasn't touched anything — so apply it
      // immediately and silently instead of gambling on them noticing a
      // toast. Once the app has been open a while, fall back to the
      // original opt-in toast so an update mid-workout-log still can't yank
      // the page out from under someone actively typing.
      if (appJustLaunched) {
        applyPWAUpdate();
        return;
      }
      window.dispatchEvent(new CustomEvent('pwa:need-refresh'));
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('pwa:offline-ready'));
    },
    onRegisterError(error) {
      console.error('Service worker registration failed:', error);
    },
  });
}

// Tells the waiting worker to skip waiting + activate, then reloads once
// it takes control. Safe to call any time after initPWA().
export function applyPWAUpdate() {
  applyUpdateFn?.(true);
}
