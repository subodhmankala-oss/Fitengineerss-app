// Central place that talks to the service worker. Kept out of main.jsx so
// the update/offline signals are easy to reuse from any component via plain
// DOM CustomEvents (no extra state library needed for two booleans).
import { registerSW } from 'virtual:pwa-register';

let swRegistration = null;
let updatePending = false;
let reloadingForUpdate = false;
let lastFilePickerClickAt = 0;

// UPDATE POLICY (2026-09-27): a newer build is announced, not forced on
// someone mid-session. The UpdateBanner offers "Refresh"; if it's ignored or
// dismissed, the update is applied the moment the app goes into the
// background (see the visibilitychange listener in initPWA) — so the reload
// happens while nobody is looking, and they come back to the new build.
// A build that's already waiting on a cold launch is still applied straight
// away: nothing is in progress yet, so there's nothing to interrupt.
//
// History: 2026-08-18 switched to reloading the instant an update was found,
// because an opt-in toast left people on buggy builds for days (see
// UpdateBanner.jsx). Applying on background keeps that guarantee without
// pulling the screen out from under someone who is typing.

// Tells a waiting worker to take over. The controllerchange listener
// registered in initPWA does the actual reload once it has.
function applyWaitingWorker() {
  const waiting = swRegistration?.waiting;
  // No controller means this is a first install — nothing is being replaced,
  // so there's no stale bundle to escape and no reason to reload.
  if (!waiting || !navigator.serviceWorker.controller) return false;
  waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

function hasWaitingUpdate() {
  return !!(swRegistration?.waiting && navigator.serviceWorker.controller);
}

function announceUpdate() {
  updatePending = true;
  window.dispatchEvent(new CustomEvent('pwa:need-refresh'));
}

export function initPWA() {
  if (!('serviceWorker' in navigator)) return;

  // sw.js never calls clients.claim(), so the controller only ever changes
  // when a waiting worker is told to skip waiting — i.e. an update. Reload
  // onto the new build whenever that happens, in every open tab: a tab left
  // running the old JS under the new worker would request hashed chunks the
  // current deployment no longer has.
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });
  }

  // Opening the camera / photo picker from an <input type="file"> (meal
  // scanner, coach logo, payment QR) backgrounds the page on mobile. Applying
  // the update then would reload the page and throw away the photo being
  // picked, so a hide that follows a file-input click right away is skipped.
  // The banner stays up and the next real backgrounding applies it.
  document.addEventListener('click', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'file') {
      lastFilePickerClickAt = Date.now();
    }
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (Date.now() - lastFilePickerClickAt < 5000) return;
    applyWaitingWorker();
  });

  // registerType is 'prompt' (vite.config.js), so the plugin reports a new
  // worker via onNeedRefresh and leaves applying it to us.
  registerSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      swRegistration = registration;
      // A worker that finished installing on a PREVIOUS visit may already be
      // waiting — onNeedRefresh can't see that case (it only reports installs
      // it watches during this page's lifetime), and without taking it here
      // the browser keeps serving the old bundle on every reload until every
      // tab for the origin is closed at once, which on a phone can be never.
      // Found 2026-09-15: a preview served index-CkekcBqf.js while the open
      // page still ran index-BhKVFcUv.js with a waiting worker parked behind
      // it. This runs on load, before anything is in progress, so it's safe
      // to apply immediately rather than just announce.
      applyWaitingWorker();
      // BUG FIX 2026-08-16: check the instant the registration is ready —
      // main.jsx's pageshow check can fire before this callback lands and
      // would otherwise no-op on every cold launch.
      registration.update().catch(() => {});
      // Check for a newer deploy periodically while the app stays open, not
      // just on the initial page load. Errors here are non-fatal; the next
      // interval just tries again.
      setInterval(() => {
        registration.update().catch(() => {});
      }, 5 * 60 * 1000);
    },
    onNeedRefresh() {
      announceUpdate();
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('pwa:offline-ready'));
    },
    onRegisterError(error) {
      console.error('Service worker registration failed:', error);
    },
  });
}

// Activates the waiting worker now; the page reloads once it takes control.
// Falls back to a plain reload if there's no waiting worker to hand over to
// (e.g. it was already activated from another tab). Safe to call any time
// after initPWA().
export function applyPWAUpdate() {
  if (!applyWaitingWorker()) window.location.reload();
}

// The 5-minute setInterval above is NOT a reliable way to catch updates on a
// long-open mobile session: mobile browsers throttle or fully suspend JS
// timers for backgrounded/inactive tabs to save battery, so an installed PWA
// left open for hours can have that interval simply never fire. Confirmed
// 2026-08-13: a coach's tab open 8h43m+ never saw an update, for two deploys
// in a row.
//
// `visibilitychange`->visible and `pageshow` are far more reliable: they
// fire when the OS actually hands the tab execution time again, which is a
// real event even for a process that was fully suspended in between. main.jsx
// calls this from both. It only announces — applying happens on the next
// backgrounding, so returning to the app never reloads it in someone's face.
export async function checkForUpdateOnForeground() {
  if (!swRegistration) return;
  try {
    await swRegistration.update();
  } catch { /* offline — next foreground event tries again */ }
  if (updatePending || hasWaitingUpdate()) announceUpdate();
}

// A stale tab silently running pre-fix JS reproduces whatever bug that fix
// addressed, forever, no matter how many times "try again" is tapped — the
// broken code is already loaded into memory and a background SW update
// doesn't touch it. Reported repeatedly 2026-08-13: a coach's Live Log save
// kept failing with "Failed to save session" hours after the actual fix had
// already shipped and gone live, because their tab had been open since
// before the deploy. This lets a save path check, on the spot, whether a
// newer build is already sitting there waiting, so the recovery path can be
// "you're on an old version — updating now" instead of a dead-end retry loop.
export async function checkForPendingPWAUpdate() {
  if (updatePending || hasWaitingUpdate()) return true;
  if (!swRegistration) return false;
  try {
    await swRegistration.update();
  } catch { /* offline or registration gone — treat as "no update found" */ }
  // onNeedRefresh fires off the update() call when a new SW is found, but
  // give the event loop a tick to actually run it.
  await new Promise((r) => setTimeout(r, 300));
  return updatePending || hasWaitingUpdate();
}
