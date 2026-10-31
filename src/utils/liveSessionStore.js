// Hands the logger's ticked-but-not-yet-saved sets to the Muscles tab, so
// Muscle Balance moves with every tick instead of only after Finish. The
// client logger publishes on every change; the Progress dashboard reads on
// mount and listens for the event. Stored per account (the device's
// localStorage is shared by every account that signs in on it), and cleared
// when the workout is finished or discarded — the saved rows take over then.
// The coach Live Log needs no store: the client's Muscles tab is on the
// same screen, so it adds tickedSetRows directly.

const KEY = 'liveSessionRows';
export const LIVE_ROWS_EVENT = 'liveSessionRowsUpdated';

const isWarmupSet = (set) => !!set.isWarmup || set.setType === 'warmup';

/**
 * Ticked sets as workout_logs-shaped rows (log_date, exercise_name,
 * weight_kg, reps, set_type, created_at), so getWeeklyMuscleStats and the
 * rest of the Muscles tab count them exactly like saved sets. Unticked sets
 * are left out: only work actually done counts.
 */
export function tickedSetRows(exercises, logDate) {
  const rows = [];
  (exercises || []).forEach(ex => {
    (ex.sets || []).forEach((set, i) => {
      if (!set.isCompleted) return;
      rows.push({
        log_date: logDate,
        exercise_name: ex.name,
        set_number: i + 1,
        weight_kg: parseFloat(set.weight) || 0,
        reps: parseInt(set.reps, 10) || 0,
        set_type: isWarmupSet(set) ? 'warmup' : (set.setType || 'normal'),
        // When the set was ticked — what recovery reads for saved rows.
        created_at: set.completedAt ? new Date(set.completedAt).toISOString() : null,
      });
    });
  });
  return rows;
}

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
