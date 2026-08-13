// Central place that talks to the service worker. Kept out of main.jsx so
// the update/offline signals are easy to reuse from any component via plain
// DOM CustomEvents (no extra state library needed for two booleans).
import { registerSW } from 'virtual:pwa-register';

let applyUpdateFn = null;
let swRegistration = null;
let updatePending = false;
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
      swRegistration = registration;
      // Check for a newer deploy periodically while the app stays open, not
      // just on the initial page load — closes the exact gap above for a
      // long-running session. Errors here are non-fatal; the next interval
      // just tries again.
      setInterval(() => {
        registration.update().catch(() => {});
      }, 5 * 60 * 1000);
    },
    onNeedRefresh() {
      updatePending = true;
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

// The 5-minute setInterval above is NOT a reliable way to catch updates on a
// long-open mobile session: mobile browsers throttle or fully suspend JS
// timers for backgrounded/inactive tabs to save battery, so an installed PWA
// left open for hours (screen off, app backgrounded most of that time) can
// have that interval simply never fire. Confirmed 2026-08-13: a coach's tab
// open 8h43m+ never showed the "Update available" toast at all, for two
// deploys in a row, despite the interval supposedly running the whole time.
//
// `visibilitychange`->visible and `pageshow` are far more reliable: they
// fire when the OS actually hands the tab execution time again, which is a
// real event even for a process that was fully suspended in between — unlike
// a timer, which needs to have kept ticking through the suspension to ever
// go off. main.jsx calls this from both.
export async function checkForUpdateOnForeground() {
  if (!swRegistration) return;
  try {
    await swRegistration.update();
  } catch { /* offline — next foreground event tries again */ }
  if (updatePending) {
    window.dispatchEvent(new CustomEvent('pwa:need-refresh'));
  }
}

// A stale tab silently running pre-fix JS reproduces whatever bug that fix
// addressed, forever, no matter how many times "try again" is tapped — the
// broken code is already loaded into memory and a background SW update
// doesn't touch it. Reported repeatedly 2026-08-13: a coach's Live Log save
// kept failing with "Failed to save session" hours after the actual fix had
// already shipped and gone live, because their tab had been open since
// before the deploy. This lets a genuine failure (not a timeout — see
// handleFinishLiveLog) check, on the spot, whether a newer build is already
// sitting there waiting, so the recovery path can be "you're on an old
// version — updating now" instead of a dead-end retry loop.
export async function checkForPendingPWAUpdate() {
  if (updatePending) return true;
  if (!swRegistration) return false;
  try {
    await swRegistration.update();
  } catch { /* offline or registration gone — treat as "no update found" */ }
  // onNeedRefresh fires synchronously off the update() call when a new SW is
  // found, but give the event loop a tick to actually run it.
  await new Promise((r) => setTimeout(r, 300));
  return updatePending;
}
