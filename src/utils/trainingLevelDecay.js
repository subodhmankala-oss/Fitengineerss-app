// Training Level decay: every full week without a logged workout takes 1
// point off the Training Level score (WorkoutTracker's skillLevel, 0–100).
// Shared with api/push.js, which warns the client on each day a point drops.

const DAY_MS = 24 * 60 * 60 * 1000;

// Whole days since `lastDate` (a 'YYYY-MM-DD' log_date), by local calendar day.
export function daysSinceWorkout(lastDate, now = Date.now()) {
  if (!lastDate) return null;
  const last = new Date(`${lastDate}T00:00:00`).getTime();
  const nowMs = now instanceof Date ? now.getTime() : now;
  return Math.max(0, Math.floor((nowMs - last) / DAY_MS));
}

// Points lost so far: 1 per full idle week (days 7–13 → 1, 14–20 → 2, …).
export function idleDecayPoints(lastDate, now = Date.now()) {
  const days = daysSinceWorkout(lastDate, now);
  return days == null ? 0 : Math.floor(days / 7);
}

// The push for a day a point drops (day 7, 14, 21, …), or null on other days.
export function decayWarningMessage(name, lastDate, now = Date.now()) {
  const days = daysSinceWorkout(lastDate, now);
  if (!days || days < 7 || days % 7 !== 0) return null;
  const lost = days / 7;
  return {
    title: `Your Training Level dropped 1 point, ${name}`,
    body: lost === 1
      ? 'No workout logged this week, so your Training Level went down 1 point. Log a session to stop it dropping again next week.'
      : `${lost} weeks without a workout: that's ${lost} points off your Training Level so far. Log a session today and it stops dropping.`
  };
}
