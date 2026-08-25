// Network Information API helpers — part of the low-bandwidth push
// (see PRs #24 image->WebP, #25 route code-splitting). This is the timeout
// tuning + video slow-connection gating piece that was scoped alongside
// those but not built yet.
//
// Support caveat: the Network Information API (navigator.connection) is
// Chromium-only — Safari (iOS/iPadOS/macOS) and Firefox never implemented
// it, so `navigator.connection` is undefined there. Every helper below
// treats "unknown" as "assume normal speed" rather than guessing slow,
// since a false "slow" verdict on an unsupported browser would needlessly
// shrink video quality/timeouts for users who are actually on fast wifi.

function getConnection() {
  if (typeof navigator === 'undefined') return null;
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
}

// 'slow-2g' | '2g' | '3g' | '4g' | undefined (unsupported browser)
export function getEffectiveType() {
  return getConnection()?.effectiveType;
}

export function isSaveDataOn() {
  return getConnection()?.saveData === true;
}

// True only when the browser actually reports a slow tier, or the user has
// opted into Data Saver — never true on unsupported browsers (Safari).
export function isSlowConnection() {
  if (isSaveDataOn()) return true;
  const effectiveType = getEffectiveType();
  return effectiveType === 'slow-2g' || effectiveType === '2g';
}

// Scales a base fetch/abort timeout up on a detected-slow connection, so a
// PostgREST round-trip that's merely slow (not actually hung) doesn't get
// aborted before it had a real chance to land. Left unchanged everywhere
// else, including Safari where we simply can't tell.
export function adaptiveTimeout(baseMs, { slowMultiplier = 2.5 } = {}) {
  return isSlowConnection() ? Math.round(baseMs * slowMultiplier) : baseMs;
}
