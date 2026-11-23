// What the Home screen already knows about the client's open workout, handed
// to WorkoutTracker so the logger opens on tap.
//
// WorkoutTracker used to ask the server on mount whether a workout was open
// and showed the Progress tab until it heard back: 4-5 seconds when there was
// nothing open, because an empty answer is confirmed through a second, slower
// request. Home has asked the same question by the time anything on it can be
// tapped, so its answer is kept here. In memory only: it's a head start, and
// WorkoutTracker still checks the server afterwards.

let known = null; // { userId, draft } — draft null = nothing open
const discarded = new Set(); // clock starts of sessions discarded this visit

export function rememberOpenDraft(userId, draft) {
  known = userId ? { userId, draft: draft || null } : null;
}

// The server delete may still be on its way when Home next asks, so a
// discarded session must not be handed over again.
export function forgetDiscardedDraft(timerStartedAt) {
  const start = Number(timerStartedAt);
  if (start > 0) discarded.add(start);
  known = null;
}

// Called once WorkoutTracker has mounted: from here on it owns the session.
export function clearOpenDraft() {
  known = null;
}

// True when Home's check came back and found nothing open.
export function isKnownNoOpenDraft(userId) {
  return !!known && known.userId === userId && known.draft === null;
}

// The client's own open session in WorkoutTracker's local draft shape, or null.
export function peekOpenDraft(userId, logClient) {
  const draft = known && known.userId === userId ? known.draft : null;
  if (!draft || draft.source === 'coach' || !(draft.exercises?.length > 0)) return null;
  if (discarded.has(Number(draft.timerStartedAt))) return null;
  return {
    isLoggingWorkout: true,
    logExercises: draft.exercises,
    logClient,
    logDate: draft.logDate || undefined,
    templateName: draft.planName || '',
    activeTemplateName: '',
    loggingLevel: null,
    workoutTimerStatus: draft.timerStatus || 'idle',
    workoutTimerStartedAt: draft.timerStartedAt ?? null,
    workoutPauseIntervals: draft.pauseIntervals || [],
    savedAt: draft.updatedAt ? new Date(draft.updatedAt).getTime() : 0,
    fromCoach: !!draft.coachId,
  };
}
