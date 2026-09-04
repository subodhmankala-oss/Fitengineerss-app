import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import InstallBanner from './components/InstallBanner.jsx'
import IOSInstallBanner from './components/IOSInstallBanner.jsx'
import UpdateToast from './components/UpdateToast.jsx'
import PullToRefresh from './components/PullToRefresh.jsx'
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
    <PullToRefresh />
  </StrictMode>,
)

// Registers the workbox-based service worker (src/sw.js) and wires up the
// safe update flow: new versions download in the background and only take
// over once the user taps "Refresh" on the UpdateToast (see registerPWA.js).
initPWA();

// Viewport/safe-area diagnostic overlay, off unless explicitly switched on
// with ?diag=1 (sticky thereafter — see the module for why an installed PWA
// needs that). Dynamically imported so it costs nothing in a normal load.
import('./diagnostics/viewportDiag.js')
  .then(({ isDiagEnabled, mountViewportDiag }) => {
    if (isDiagEnabled()) mountViewportDiag();
  })
  .catch(() => {});

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

// REMOVED 2026-08-19: setAppSafeAreaInsets(), which probed
// env(safe-area-inset-top/bottom) through an offscreen element and published
// them as --app-safe-top / --app-safe-bottom. It existed solely because
// .app-container had to re-pad itself out from under the status bar, and
// WebKit re-zeroes the live env() while an input-method panel is open — so
// the value had to be snapshotted before any keyboard interaction.
// index.html no longer opts into edge-to-edge (`viewport-fit=cover` removed,
// iOS status bar style `black`), so the browser insets the viewport itself
// and nothing needs to know the inset. Both custom properties now have zero
// consumers; keeping a probe that writes variables no rule reads would be
// dead code inviting a future "fix" to reach for it again.
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
  // ROUND 7 (2026-08-18) — the loop that produced the keyboard jerk.
  // This listener exists for a real reason (browser chrome auto-hides while
  // scrolling a long list, growing the viewport), but while the on-screen
  // keyboard is open it is actively harmful: WebKit's focus scroll-into-view
  // animates the container, every animation frame fires `scroll`, each one
  // rewrote --app-vh, which resized the shell, which changed the container's
  // clientHeight and max scrollTop mid-animation, which perturbed the scroll
  // and fired more scroll events. Self-sustaining, and entirely independent
  // of whichever input was focused -- which is why five rounds of per-field
  // handlers never touched it. The chrome-autohide case this serves cannot
  // happen while the keyboard is up (the chrome is already hidden), so
  // skipping it then costs nothing. --app-vh still tracks the keyboard
  // correctly via the visualViewport 'resize' listener above.
  if (document.documentElement.classList.contains('keyboard-open')) return;
  if (scrollRafPending) return;
  scrollRafPending = true;
  requestAnimationFrame(() => {
    scrollRafPending = false;
    setAppViewportHeight();
  });
}, { capture: true, passive: true });

// ---------------------------------------------------------------------------
// iOS keyboard manager (round 7, 2026-08-18)
// ---------------------------------------------------------------------------
// Marks the document while a text field is focused, and re-anchors the
// scroll container after the keyboard closes.
//
// The `keyboard-open` class is what lets the scroll listener above bail out
// and what switches both scroll owners to instant scrolling (see index.css).
// Note this deliberately does NOT scroll the focused field into view itself:
// with the shell no longer animating its height and the feedback loop gone,
// WebKit's own scroll-into-view lands correctly on the first try. Five
// previous rounds failed precisely by fighting it; the job here is to make
// the geometry it measures stable, then stay out of the way.
//
// What it DOES own is the other half of the reported bug: the container
// shrinks when the keyboard opens, so its max scrollTop drops and the browser
// clamps scrollTop to fit. When the keyboard closes the container grows back
// but that clamped value stays -- so the coach is left somewhere else on the
// page with no way back but scrolling by hand. Recording the offset at focus
// and restoring it once the viewport has grown back fixes exactly that.
const isTextField = (el) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement);

// Nearest ancestor that genuinely scrolls. Coach screens scroll on
// .trainer-dashboard-container, client screens on .main-content -- resolved
// by measurement rather than hardcoded, so this stays correct if either
// layout changes.
function scrollOwnerOf(el) {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

let kbScrollOwner = null;
let kbScrollTop = 0;
let kbUserScrolled = false;
let kbReanchorCancelled = false;

document.addEventListener('focusin', (e) => {
  if (!isTextField(e.target)) return;
  kbScrollOwner = scrollOwnerOf(e.target);
  kbScrollTop = kbScrollOwner ? kbScrollOwner.scrollTop : 0;
  kbUserScrolled = false;
  document.documentElement.classList.add('keyboard-open');
});

// If the coach deliberately scrolls while typing, that new position is the
// one they want kept -- don't yank them back to where they started.
const markUserScroll = () => {
  if (document.documentElement.classList.contains('keyboard-open')) kbUserScrolled = true;
};
document.addEventListener('touchmove', markUserScroll, { capture: true, passive: true });
document.addEventListener('wheel', markUserScroll, { capture: true, passive: true });
// Any touch after dismissal means they're driving again -- stop re-anchoring.
document.addEventListener('touchstart', () => { kbReanchorCancelled = true; }, { capture: true, passive: true });

// The element the current tap landed on, recorded in the CAPTURE phase so it
// is already known by the time that same tap's blur reaches focusout below.
// kbReanchorCancelled cannot serve this purpose: focusout resets it to false,
// and that reset runs after the touchstart which set it, so it is always
// cleared again by the time the re-anchor loop actually starts.
let kbLastPointerTarget = null;
const recordPointerTarget = (e) => { kbLastPointerTarget = e.target; };
document.addEventListener('pointerdown', recordPointerTarget, { capture: true, passive: true });
document.addEventListener('touchstart', recordPointerTarget, { capture: true, passive: true });
document.addEventListener('mousedown', recordPointerTarget, { capture: true, passive: true });

document.addEventListener('focusout', (e) => {
  if (!isTextField(e.target)) return;
  // Tapping straight from one field to another never closes the keyboard;
  // one frame is enough for activeElement to settle on the new target.
  requestAnimationFrame(() => {
    if (isTextField(document.activeElement)) return;
    document.documentElement.classList.remove('keyboard-open');

    const owner = kbScrollOwner;
    const target = kbScrollTop;
    const userMoved = kbUserScrolled;
    const tapTarget = kbLastPointerTarget;
    kbLastPointerTarget = null;
    kbScrollOwner = null;
    if (!owner || userMoved) return;

    // The blur came from tapping a set-logging cell (Kg/Reps/Km/Time), which
    // opens the custom number pad -- and SetValueField's own handler is
    // already scrolling that row clear of the pad. Re-anchoring would fight
    // it and win: the loop below assigns scrollTop every frame for 24 frames,
    // and each assignment cancels an in-flight smooth scroll outright, so the
    // row is left buried underneath the pad with the coach typing into a
    // field they cannot see. Measured 2026-08-19 on the coach Live Log: 24
    // writes pinning scrollTop to its pre-keyboard value while the pad sat on
    // top of the row being edited. Whoever opens the pad owns the scroll
    // position from here.
    if (tapTarget && tapTarget.closest && tapTarget.closest('.set-value-btn')) return;

    // Re-assert across the dismiss animation rather than once. This is an
    // iOS timing requirement, not a guess: the visible viewport grows back
    // over the ~300ms the keyboard slides out, and the container's max
    // scrollTop grows with it. A single assignment made before that finishes
    // is silently clamped to the still-small maximum, which is the very
    // clamp this is undoing. Frame-driven (not a fixed setTimeout) and
    // abandoned the moment the coach touches the screen.
    kbReanchorCancelled = false;
    let frames = 0;
    const reanchor = () => {
      if (kbReanchorCancelled) return;
      const max = Math.max(0, owner.scrollHeight - owner.clientHeight);
      owner.scrollTop = Math.min(target, max);
      if (++frames < 24) requestAnimationFrame(reanchor);
    };
    requestAnimationFrame(reanchor);
  });
});


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
