// A founder message stops showing a week after it was sent, even if the
// client never tapped ✕ (it stays in the founder's Inbox in Super-Admin).
export const FOUNDER_MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isFounderMessageFresh(m, now = Date.now()) {
  const sent = Date.parse(m?.createdAt);
  if (!Number.isFinite(sent)) return true;
  return now - sent < FOUNDER_MESSAGE_TTL_MS;
}
