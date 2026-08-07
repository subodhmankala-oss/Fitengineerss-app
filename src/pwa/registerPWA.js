// Central place that talks to the service worker. Kept out of main.jsx so
// the update/offline signals are easy to reuse from any component via plain
// DOM CustomEvents (no extra state library needed for two booleans).
import { registerSW } from 'virtual:pwa-register';

let applyUpdateFn = null;

export function initPWA() {
  if (!('serviceWorker' in navigator)) return;

  applyUpdateFn = registerSW({
    onNeedRefresh() {
      // A new SW finished installing and is waiting. Don't force it in —
      // let UpdateToast ask the user, so nothing reloads mid-workout-log.
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
