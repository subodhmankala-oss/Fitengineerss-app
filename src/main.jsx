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

// BUG FIX 2026-08-18: .app-container's top padding used the LIVE
// env(safe-area-inset-top) directly in CSS. On an installed iOS standalone
// PWA, WebKit recomputes that value against the current visual viewport —
// and while the on-screen keyboard (or, worse, the emoji picker, which
// shrinks the viewport the same way a keyboard does) is showing, it can
// momentarily report the top inset as 0 instead of the notch/Dynamic
// Island's real height. Losing that padding for a frame pulls
// .app-container's content up flush with the physical top of the screen,
// overlapping/garbling with the OS status bar — reported as message
// bubbles rendering on top of the clock/battery icons the instant the
// emoji picker opened, snapping back the moment it closed. Capture the
// inset ONCE into a real px value via an offscreen probe element and drive
// the padding from that instead (see index.css) — a snapshot taken before/
// independent of any keyboard interaction, immune to WebKit re-zeroing it
// while an input method panel is up. Re-measured only on orientationchange
// (a genuine, keyboard-unrelated safe-area change), never on
// resize/visualViewport-resize, which is exactly what a keyboard/emoji
// picker opening fires.
function setAppSafeAreaInsets() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;height:0;width:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;';
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe);
  const top = computed.paddingTop;
  const bottom = computed.paddingBottom;
  document.body.removeChild(probe);
  if (top) document.documentElement.style.setProperty('--app-safe-top', top);
  if (bottom) document.documentElement.style.setProperty('--app-safe-bottom', bottom);
}
setAppSafeAreaInsets();
requestAnimationFrame(() => requestAnimationFrame(setAppSafeAreaInsets));
window.addEventListener('orientationchange', setAppSafeAreaInsets);
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

// BUG FIX 2026-08-18 (round 6) — the actual root cause of the recurring
// "keyboard opens, content overlaps the status bar / a large blank area
// appears" reports (five prior rounds all targeted the WRONG mechanism —
// see the removed handleCoachNoteFocus in TrainerDashboard.jsx). Every
// previous fix tracked window.visualViewport.height (--app-vh, above) to
// keep .app-container correctly SIZED for the keyboard. None of them
// tracked window.visualViewport.offsetTop/offsetLeft — the OTHER half of
// the visualViewport API, which reports how far iOS Safari has PANNED the
// visible region within the (unchanged) layout viewport to keep a focused
// input's caret in view. This pan is a native WebKit behavior that moves
// what's on screen independently of any CSS `overflow`, `position`, or
// scrollTop — html/body already lock overflow-y: hidden (see index.css)
// specifically to make the page itself unscrollable, but that has no
// effect on this pan; it isn't a scroll. Once iOS pans the visible region
// down to reveal a focused field lower on the page, .app-container's own
// content (including the safe-area top padding — see --app-safe-top) slides
// up out of the pan with it, landing flush against — or past — the real,
// physically fixed status bar, which is exactly the overlap/blank-area
// symptom in every report so far, and explains why it kept recurring no
// matter which scroll-correction logic was tried on individual fields: the
// pan happens above the level any per-field handler could reach.
// Countered here, once, for the whole app: translate the ENTIRE rendered
// page by the exact negative of the pan on every visualViewport resize/
// scroll event, canceling it out so the app's content stays visually
// anchored to the real screen — including the status bar — regardless of
// which input iOS decided to scroll toward. See index.css's `body` rule for
// where --vv-offset-top/left are consumed.
function setViewportOffset() {
  const vv = window.visualViewport;
  if (!vv) return;
  document.documentElement.style.setProperty('--vv-offset-top', `${vv.offsetTop}px`);
  document.documentElement.style.setProperty('--vv-offset-left', `${vv.offsetLeft}px`);
}
setViewportOffset();
window.visualViewport?.addEventListener('resize', setViewportOffset);
window.visualViewport?.addEventListener('scroll', setViewportOffset);

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
