// Its own file so main.jsx can spot a share link without loading the muscle
// and exercise data workoutShare.js needs.
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

// The token in a /w/<token> address, or null when it isn't a share link.
// A malformed one gives '' (still a share link, just not a working one).
export function shareTokenFromPath(pathname) {
  const m = /^\/w\/([^/]*)\/?$/.exec(pathname || '');
  if (!m) return null;
  return SHARE_TOKEN_RE.test(m[1]) ? m[1] : '';
}
