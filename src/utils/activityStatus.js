// Shared "last active" classification for the Super-Admin dashboard
// (AdminClientsList, AdminCoachesList) — turns a users.last_login timestamp
// into the day-count and badge the admin views render, so both stay
// consistent with the daily inactivity nudges (api/send-inactivity-nudges.js)
// which use the same day boundaries.

// Days since last_login, rounded down. Null when the user has never logged
// in (last_login is null) so callers can distinguish "never" from "0 days".
export function daysSinceLogin(lastLogin) {
  if (!lastLogin) return null;
  const diffMs = Date.now() - new Date(lastLogin).getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

// Days of inactivity at which a user flips from the amber "gone quiet"
// badge to the red "long inactive" badge. Kept in one place so the
// per-row badges and the summary tiles below stay in sync.
export const LONG_INACTIVE_DAYS = 6;

// Buckets a user into an activity status for badges + summary counts.
export function getActivityStatus(lastLogin) {
  const days = daysSinceLogin(lastLogin);
  if (days === null) return { key: 'never', label: 'Never logged in', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.25)' };
  if (days <= 0) return { key: 'active', label: 'Active today', color: '#10b981', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.2)' };
  if (days < LONG_INACTIVE_DAYS) return { key: 'inactive-mid', label: `${days} day${days === 1 ? '' : 's'} inactive`, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.2)' };
  return { key: 'inactive-long', label: `${days} days inactive`, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.2)' };
}
