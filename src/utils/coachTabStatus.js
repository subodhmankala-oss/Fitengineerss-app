// Status lines for the coach client-detail tabs (CoachDetailTabs).
import { formatDuration } from './liveWorkoutTimer';
import { getLocalDateString, parseLocalDateString } from './dateUtils';

const shortClock = (secs) => formatDuration(secs).replace(/^00:/, '');

export function daysAgoLabel(dateStr, today = getLocalDateString()) {
  if (!dateStr) return null;
  const days = Math.round((parseLocalDateString(today) - parseLocalDateString(dateStr)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// Pure: the small status line under each tab name.
export function tabStatuses({ coachPlanCount = 0, liveStatus = 'idle', liveElapsedSeconds = 0, liveExerciseCount = 0, lastWorkoutDate = null, latestWeight = null, previousWeight = null, measurementDueDays = null, today }) {
  const plans = coachPlanCount > 0 ? `${coachPlanCount} plan${coachPlanCount === 1 ? '' : 's'}` : 'No plan yet';

  let live = 'Start session';
  if (liveStatus === 'running') live = shortClock(liveElapsedSeconds);
  else if (liveStatus === 'paused') live = `Paused ${shortClock(liveElapsedSeconds)}`;
  else if (liveExerciseCount > 0) live = `${liveExerciseCount} exercise${liveExerciseCount === 1 ? '' : 's'}`;

  const history = lastWorkoutDate ? daysAgoLabel(lastWorkoutDate, today) : 'No workouts';

  const w = parseFloat(latestWeight);
  const p = parseFloat(previousWeight);
  let measurements = 'Not logged';
  if (Number.isFinite(w)) {
    measurements = `${+w.toFixed(1)} kg`;
    if (Number.isFinite(p) && Math.abs(w - p) >= 0.05) {
      const d = +(w - p).toFixed(1);
      measurements += ` ${d > 0 ? '+' : '−'}${Math.abs(d)}`;
    }
  }
  // Overdue check-in beats the weight readout — it's what the coach acts on.
  if (Number.isFinite(measurementDueDays)) measurements = `Due · ${measurementDueDays}d`;
  return { plans, livelog: live, workout: history, measurements };
}
