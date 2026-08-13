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
