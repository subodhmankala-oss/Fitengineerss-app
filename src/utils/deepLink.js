// Push-notification deep links. Every push api/push.js sends carries a `url`
// like `/?viewClient=<id>&clientTab=measurements` or `/?tab=workouts`, and
// sw.js's notificationclick handler delivers it one of two ways:
//
//   1. The app is already open (the usual case on a phone — it's suspended in
//      the background): sw.js posts OPEN_DEEP_LINK to that window and App.jsx
//      applies it in place, no reload.
//   2. Otherwise the window is navigated/opened to the URL, and App.jsx reads
//      the query params on load via takeInitialDeepLink() below.
//
// Path 2 used to lose the link almost every time (reported 2026-09-24: "just
// opens the homescreen"). App.jsx stripped the params from the address bar on
// its very first render, and then a reload landed moments later — the 15-min
// resume refresh, or the auto-applied service-worker update — reloading a
// bare `/`. The link is now also stashed in sessionStorage (which survives a
// same-tab reload) for a short window, so a reload right after the tap still
// lands on the right screen.

const STORAGE_KEY = 'pendingDeepLink';
// Long enough to outlive the reloads above (they happen within seconds of the
// tap), short enough that a manual refresh a minute later doesn't reopen it.
const MAX_AGE_MS = 30 * 1000;

const KEYS = ['tab', 'viewClient', 'clientTab', 'openMeasurements', 'openMuscleMap', 'section', 'openMonthlyReport'];

export const CLIENT_TABS = ['home', 'workouts', 'profile'];

export function parseDeepLink(search) {
  const params = new URLSearchParams(search || '');
  const link = {};
  for (const key of KEYS) {
    const value = params.get(key);
    if (value) link[key] = value;
  }
  return Object.keys(link).length > 0 ? link : null;
}

export function stashDeepLink(link) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ link, at: Date.now() }));
  } catch { /* private mode / storage blocked — the in-memory copy still works */ }
}

// Called once per page load. URL params win (a fresh tap); otherwise a link
// stashed by a tap just before a reload.
export function takeInitialDeepLink() {
  const fromUrl = parseDeepLink(window.location.search);
  if (fromUrl) {
    stashDeepLink(fromUrl);
    // Keep the address bar clean so sharing/bookmarking the page doesn't
    // carry the deep link along with it.
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    return fromUrl;
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { link, at } = JSON.parse(raw);
    if (link && Date.now() - at < MAX_AGE_MS) return link;
    sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* unreadable stash — treat as none */ }
  return null;
}

// The client-side tab a deep link lands on, or null to leave the tab alone.
export function tabForDeepLink(link) {
  if (!link) return null;
  if (link.openMeasurements === '1') return 'profile';
  if (link.openMuscleMap === '1' || link.openMonthlyReport === '1') return 'home';
  return CLIENT_TABS.includes(link.tab) ? link.tab : null;
}
