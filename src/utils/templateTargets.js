// A library program writes a cardio move's target in its reps field as a
// duration ("30 min", "20 min") or a distance ("1 km"). The logger's cardio
// sets are distance + time, so a duration becomes the set's mm:ss target
// (shown as the time box's placeholder, and what the countdown uses).
// Anything else — a distance, a rep count, nothing — has no time target.
export function templateTargetTime(reps) {
  const m = String(reps ?? '').trim().toLowerCase().match(/^(\d+)\s*(min|mins|minutes)?$/);
  if (!m || !m[2]) return '';
  const minutes = parseInt(m[1], 10);
  if (!minutes || minutes > 180) return '';
  return `${String(minutes).padStart(2, '0')}:00`;
}
