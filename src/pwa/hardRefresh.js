// Full client-side reset: drop every service-worker cache, unregister the
// workers themselves, and reload from the network.
//
// Why this exists: the service worker precaches index.html. An installed PWA
// launching from the home screen can therefore boot the PREVIOUS build's
// HTML — including its <meta> tags — even though a new version is deployed.
// Anything defined in the document head (viewport/viewport-fit, iOS status
// bar style, theme-color) is then stale in a way a normal in-app reload
// cannot fix, because that reload is itself served by the stale worker.
// Until now the only reliable escape was deleting the app from the home
// screen and re-adding it, which is not something a coach or client should
// ever be asked to do to receive a fix.
//
// Deliberately NOT cleared: localStorage and sessionStorage. They hold the
// auth session, the coach/client role, and in-progress workout drafts, so
// wiping them would log the user out and discard unsynced session data —
// turning "get the latest version" into "lose your work". This clears the
// code and asset layer only; user state is untouched.

const FRESH_PARAM = '_fresh';

// Reload bypassing the HTTP cache. `location.reload(true)` is a no-op in
// modern browsers (the forceReload argument was removed from the spec), and
// Cache-Control on a PWA's index.html is not something we control from here,
// so a one-shot unique query string is the dependable way to guarantee the
// document itself comes from the network rather than a memory/disk hit.
function reloadFromNetwork() {
  const url = new URL(window.location.href);
  url.searchParams.set(FRESH_PARAM, Date.now().toString(36));
  window.location.replace(url.toString());
}

// The cache-busting param has done its job once the fresh document has
// loaded; leaving it in the address bar would also make it part of any URL
// the user bookmarks or shares. Strip it without adding a history entry.
export function stripFreshParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(FRESH_PARAM)) return;
    url.searchParams.delete(FRESH_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* URL/history unavailable — harmless, the param is cosmetic by now */
  }
}

/**
 * Clears all app caches and reloads from the network.
 * @returns {Promise<{ok: boolean, reason?: string}>} Resolves with ok:false
 *   if the refresh was refused; on success the page navigates away instead.
 */
export async function hardRefresh({ requireOnline = true } = {}) {
  // Guard: clearing the precache while offline removes the only copy of the
  // app that can boot without a network, leaving the user staring at the
  // offline page with no way back. Refuse rather than brick the install.
  if (requireOnline && navigator.onLine === false) {
    return { ok: false, reason: 'offline' };
  }

  // Order matters. Delete caches BEFORE unregistering the workers: an active
  // worker can repopulate a cache it is still controlling, so unregistering
  // first leaves a window where the old worker's fetch handlers re-add
  // entries that were just removed.
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* Cache API blocked (private mode, storage pressure) — the reload below
       still bypasses the HTTP cache, so continue rather than abort. */
  }

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* Same reasoning as above — a failed unregister must not block the
       reload, which is the part that actually gets the user a new build. */
  }

  reloadFromNetwork();
  return { ok: true };
}
