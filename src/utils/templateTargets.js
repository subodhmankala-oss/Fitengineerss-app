// A library program writes a cardio or timed move's target in its reps
// field as a duration ("30 min", "4 min", "30s") or a distance ("1 km").
// The logger times these, so a duration becomes the set's mm:ss target
// (shown as the time box's placeholder, and what the countdown uses).
// Anything else — a distance, a rep count, nothing — has no time target.
export function templateTargetTime(reps) {
  const m = String(reps ?? '').trim().toLowerCase().match(/^(\d+)\s*(min|mins|minutes|s|sec|secs|seconds)?$/);
  if (!m || !m[2]) return '';
  const n = parseInt(m[1], 10);
  const seconds = m[2].startsWith('m') ? n * 60 : n;
  if (!seconds || seconds > 180 * 60) return '';
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}
