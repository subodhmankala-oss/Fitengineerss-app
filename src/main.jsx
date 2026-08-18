import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import InstallBanner from './components/InstallBanner.jsx'
import IOSInstallBanner from './components/IOSInstallBanner.jsx'
import UpdateToast from './components/UpdateToast.jsx'
import { TourProvider } from './context/TourContext.jsx'
import { CoachTourProvider } from './context/CoachTourContext.jsx'
import { initPWA, checkForUpdateOnForeground } from './pwa/registerPWA.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TourProvider>
      <CoachTourProvider>
        <App />
      </CoachTourProvider>
    </TourProvider>
    <InstallBanner />
    <IOSInstallBanner />
    <UpdateToast />
  </StrictMode>,
)

// Registers the workbox-based service worker (src/sw.js) and wires up the
// safe update flow: new versions download in the background and only take
// over once the user taps "Refresh" on the UpdateToast (see registerPWA.js).
initPWA();

// Keep --app-vh (see .app-container in index.css) pinned to the real visible
// viewport. CSS `dvh` alone isn't enough here: several mobile/PWA browsers
// (installed standalone PWAs on Android in particular, plus Safari after the
// keyboard closes) don't reliably re-run layout when the actual visible
// viewport changes, leaving .app-container measured taller than what's on
// screen — which pushes the bottom nav bar below the fold until the user
// force-closes and reopens the app. Recomputing from window.visualViewport
// (falls back to window.innerHeight where it's unavailable) and writing a
// real pixel-derived value forces the browser to actually reflow every time
// the viewport genuinely changes, instead of trusting a unit that some
// engines silently fail to update.
// Connectivity came back — replay any workout save that failed while the
// device was offline or the session was stale. See flushPendingWorkoutLogs.
// Registered here (not in a component) so it survives every route/role change
// and fires even if the coach never re-opens the Live Log tab.
window.addEventListener('online', () => {
  import('./services/databaseService')
    .then(({ flushPendingWorkoutLogs }) => flushPendingWorkoutLogs())
    .catch(() => {});
});

function setAppViewportHeight() {
  const h = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--app-vh', `${h / 100}px`);
}
setAppViewportHeight();
// BUG FIX 2026-08-18: the call above runs synchronously the instant this
// script parses -- but on a cold launch of an installed iOS standalone PWA
// specifically, window.visualViewport.height/innerHeight can report a
// transitional, shorter-than-final value at that exact instant: WebKit
// hasn't finished settling into true full-screen chrome-less presentation
// yet. Every subsequent measurement in this file is event-driven (resize,
// orientationchange, visualViewport resize, visibilitychange, pageshow) --
// if none of those fire during the session (entirely plausible: open the
// app, use it, never background/rotate it), --app-vh stays wrong for the
// WHOLE session on EVERY screen, which is exactly "persistent, present
// immediately, not scoped to one screen" as reported. Re-measure a couple
// frames later (layout has had a chance to settle) and again after a short
// delay as a belt-and-suspenders catch for slower devices, so a bad
// first-instant reading gets corrected even when no real resize ever
// happens to trigger the existing listeners.
requestAnimationFrame(() => requestAnimationFrame(setAppViewportHeight));
setTimeout(setAppViewportHeight, 500);
window.addEventListener('resize', setAppViewportHeight);
window.addEventListener('orientationchange', setAppViewportHeight);
window.visualViewport?.addEventListener('resize', setAppViewportHeight);
// Coming back from the background (app switcher, locked screen, tab
// backgrounded) is the exact moment the browser's own dvh tracking has been
// seen to go stale — re-measure on regaining visibility/focus too, not just
// on an explicit resize event.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    setAppViewportHeight();
    // See checkForUpdateOnForeground's comment: this is the reliable place
    // to catch an update on a tab that's been backgrounded/suspended for
    // hours, since the 5-minute background timer can't be trusted to have
    // kept running the whole time.
    checkForUpdateOnForeground();
  }
});
window.addEventListener('pageshow', () => {
  setAppViewportHeight();
  checkForUpdateOnForeground();
});
// Scrolling a long list (e.g. the coach's client directory) is the other
// common trigger for the mobile browser chrome (address bar) to auto-hide,
// growing the real visible viewport — but .app-container's height is a
// fixed px value snapped from --app-vh at the last resize/visibilitychange,
// so it doesn't grow with it. The gap between the two showed up as a large
// empty band below the app's actual content, worst right at the end of a
// long scrolled list where there's nothing below to visually mask it.
// Reported 2026-08-18 for the "My Clients" list on a real device; not
// reproducible in a desktop browser tool, where resize/visualViewport
// already cover every size change. `scroll` doesn't bubble, but a
// capturing listener on `document` still receives it from any descendant
// scroll container (the coach dashboard's internal .trainer-dashboard-
// container included) without needing to know which element is scrolling.
// rAF-throttled since scroll fires far more often than the height actually
// changes.
let scrollRafPending = false;
document.addEventListener('scroll', () => {
  if (scrollRafPending) return;
  scrollRafPending = true;
  requestAnimationFrame(() => {
    scrollRafPending = false;
    setAppViewportHeight();
  });
}, { capture: true, passive: true });

// Tap-outside-to-dismiss for native text inputs/textareas (Plan Name,
// Routine Name, coach note, etc.) — mirrors SetNumberPad's own outside-tap
// close for the custom numeric pad, but for the OS's native keyboard.
// Tapping a non-focusable area (blank page background, a card, a label)
// doesn't reliably blur the currently focused field on every mobile browser
// on its own — reported as the keyboard staying open with nowhere obvious
// to tap to close it. Runs in the capture phase, before the tap's own
// handlers, and skips other inputs/textareas/selects so tapping a DIFFERENT
// field just moves focus there as normal instead of fighting it.
// Listens on multiple event types (not just `pointerdown`) because some
// mobile WebViews this app runs in don't reliably dispatch Pointer Events —
// `touchstart`/`mousedown` are the same handler and simply no-op a second
// time once the field is already blurred.
function dismissKeyboardOnOutsideTap(e) {
  const active = document.activeElement;
  if (!active || !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return;
  if (active.contains(e.target)) return;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  active.blur();
}
document.addEventListener('pointerdown', dismissKeyboardOnOutsideTap, true);
document.addEventListener('touchstart', dismissKeyboardOnOutsideTap, true);
document.addEventListener('mousedown', dismissKeyboardOnOutsideTap, true);
