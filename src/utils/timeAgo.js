// "5m ago" / "3h ago" / "2d ago" for an ISO timestamp — the short relative
// time the in-app alert cards show.
export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins || 1}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
