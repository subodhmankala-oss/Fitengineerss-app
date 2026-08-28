// Shared helpers behind the <Avatar> component (src/components/Avatar.jsx).
//
// Priority for what photo to show, for both coach and client logins:
//   1. An explicit avatarUrl (Google OAuth's real photo, or whatever a
//      previous Google login already saved to users.avatar_url).
//   2. A Gravatar for the account's email, if that email has one registered.
//   3. Initials on a colored circle (the original placeholder look).
//
// Gravatar has accepted SHA-256 email hashes since 2023 (alongside the older
// MD5 scheme), so this uses the browser's built-in Web Crypto API instead of
// pulling in an md5 dependency just for this.
export async function gravatarUrl(email, size = 128) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(normalized));
  const hash = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  // d=404 makes Gravatar 404 (instead of returning a generic silhouette)
  // when the email has no registered photo, so <img onError> can fall
  // through to the initials circle.
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

export function getInitials(name, email) {
  const source = (name || '').trim() || (email || '').split('@')[0] || '';
  if (!source) return '?';
  const parts = source.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic color from the name/email so the same person always gets the
// same placeholder color across screens and reloads.
const PALETTE = ['#10b981', '#3b82f6', '#ea4335', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];
export function getAvatarColor(seed) {
  const s = seed || '';
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
