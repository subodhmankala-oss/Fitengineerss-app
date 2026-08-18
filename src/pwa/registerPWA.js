// Central place that talks to the service worker. Kept out of main.jsx so
// the update/offline signals are easy to reuse from any component via plain
// DOM CustomEvents (no extra state library needed for two booleans).
import { registerSW } from 'virtual:pwa-register';

let applyUpdateFn = null;
let swRegistration = null;
let updatePending = false;

export function initPWA() {
  if (!('serviceWorker' in navigator)) return;

  applyUpdateFn = registerSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      swRegistration = registration;
      // BUG FIX 2026-08-16: main.jsx's `pageshow` listener calls
      // checkForUpdateOnForeground() as the "catch an update on cold
      // launch" path — but pageshow fires right after the page's `load`
      // event, while registerSW()'s own registration handshake (this
      // callback) is async and lands later. checkForUpdateOnForeground()
      // no-ops via its `if (!swRegistration) return` guard until
      // swRegistration is set here, so on a literal close-and-reopen —
      // the exact repro a coach reported — the cold-launch check was lost
      // to this race on EVERY launch, leaving only the 5-minute interval
      // (unreliable: mobile browsers throttle/suspend timers on
      // backgrounded tabs) to ever find a pending update. Check the
      // instant the registration itself is ready instead of waiting on an
      // event that may have already fired before this ran.
      registration.update().catch(() => {});
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
      // POLICY CHANGE 2026-08-18: previously this only ever surfaced a
      // dismissible toast and left applying the update entirely up to the
      // user tapping "Refresh" (see the 2026-08-13 regression fix this
      // replaces). That made every fix's rollout depend on someone noticing
      // and tapping a toast — and in practice they often didn't: a coach's
      // Live Log and a client's own logger both kept silently computing
      // durationSeconds/caloriesBurned as null for a bug that had already
      // been fixed and deployed, hours/days earlier, because their tab was
      // still running the old JS and nothing forced it to update. Reported
      // repeatedly (2026-08-13 for a save failure, 2026-08-18 for silently
      // wrong saved data) — different symptoms, same root cause: an
      // update that's ready and waiting but never gets applied.
      //
      // This is NOT the same as the 2026-08-13 regression: that one only
      // auto-applied within a narrow "first 5s of app open" window, which
      // (with deploys landing several times a day) ended up swallowing the
      // toast almost every single reopen. This applies unconditionally,
      // whenever a new build is found — on the initial registration check,
      // the 5-minute interval, or a foreground/pageshow check — so it isn't
      // gated to a window that eats the common case.
      //
      // Still surfaces the toast (so an update isn't invisible — the coach
      // sees why the screen just reloaded) but no longer waits on a tap to
      // apply it: every in-progress session is already continuously
      // autosaved to a draft (client and coach Live Log both), so a reload
      // here loses at most the last few keystrokes, not the session.
      window.dispatchEvent(new CustomEvent('pwa:need-refresh'));
      applyUpdateFn?.(true);
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
