// Queues a Workout Library program to start the moment the Workouts tab
// mounts: writes the same localStorage keys WorkoutTracker reads on mount
// (lastTabKey/lastLevelKey/lastCategoryKey + the autoStart payload, see its
// "Deep-link auto-start" effect). The caller then switches to the Workouts
// tab. Lands the client on the right tab / level / category even if the
// auto-start can't run (e.g. a session is already in progress); when it
// can, they're straight into logging `program` — no extra tap needed.
//
// Shared by the home screen's NextWorkoutBanner and the "first workout"
// screen at the end of the sign-up wizard (FirstWorkoutPicker).
export function startLibraryProgram(userId, category, level, program) {
  if (!userId || !program) return;
  try {
    localStorage.setItem(`workoutTrackerLastTab_${userId}`, 'templates');
    localStorage.setItem(`workoutTrackerLastLevel_${userId}`, level);
    localStorage.setItem(`workoutTrackerLastCategory_${userId}`, category);
    localStorage.setItem(`workoutTrackerAutoStart_${userId}`, JSON.stringify({
      name: program.name,
      exercises: program.exercises,
      level
    }));
  } catch { /* ignore quota/serialization errors */ }
}
