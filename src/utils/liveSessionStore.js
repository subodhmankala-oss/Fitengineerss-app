// Hands the client logger's ticked-but-not-yet-saved sets to the Muscles
// tab, so Muscle Balance moves with every tick instead of only after
// Finish. The logger publishes on every change; the Progress dashboard reads
// on mount and listens for the event. Stored per account (the device's
// localStorage is shared by every account that signs in on it), and cleared
// when the workout is finished or discarded — the saved rows take over then.

const KEY = 'liveSessionRows';
export const LIVE_ROWS_EVENT = 'liveSessionRowsUpdated';

export function publishLiveRows(userId, rows) {
  try {
    if (userId && rows && rows.length > 0) localStorage.setItem(KEY, JSON.stringify({ userId, rows }));
    else localStorage.removeItem(KEY);
  } catch { /* private mode / quota: Muscle Balance just updates after Finish */ }
  window.dispatchEvent(new CustomEvent(LIVE_ROWS_EVENT));
}

/** This account's live rows, or [] (another account's are ignored). */
export function readLiveRows(userId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    return parsed && userId && parsed.userId === userId && Array.isArray(parsed.rows) ? parsed.rows : [];
  } catch {
    return [];
  }
}
