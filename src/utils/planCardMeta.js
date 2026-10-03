import { getMuscleGroupsForExercise, MUSCLE_TO_PPLC, MUSCLE_BODY_VIEW } from './muscleGroups';

// Push/Pull/Legs/Core color coding for the routine-picker cards — same
// categorization Section 3 of Weekly Muscle Analytics uses (MUSCLE_TO_PPLC),
// so a "Push Strength" plan's thumbnail/chips read the same warm-red family
// a client already associates with chest/shoulders/triceps elsewhere.
export const PPLC_COLOR = { Push: '#ef4444', Pull: '#3b82f6', Legs: 'var(--primary-accent-light)', Core: '#a855f7' };

// Derives the routine-picker card's display data from a plan's exercise list
// — muscle groups trained, a representative body region + color for its
// MuscleThumbnail, and a rough duration estimate (no real duration is
// tracked per plan, so this is a heuristic: ~1min work + ~1.5min rest per
// set, rounded to the nearest 5 minutes for a clean-looking number).
export const getPlanCardMeta = (plan) => {
  const exercises = plan.exercises || [];
  const exerciseCount = exercises.length;
  const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);

  // getMuscleGroupsForExercise returns [primary, secondary?] — a compound
  // press/row/squat names its secondary mover (Triceps/Biceps/Glutes) on
  // almost every exercise, so counting mentions flat let that rider outscore
  // the muscle the day is actually built around (a Push day of bench/incline/
  // overhead press racked up more "Triceps" mentions than "Chest" ones,
  // because every one of those presses also credits triceps). Weighting the
  // first-listed muscle double keeps the actual target on top.
  const muscleCounts = {};
  exercises.forEach(ex => {
    getMuscleGroupsForExercise(ex.name).forEach((m, i) => {
      muscleCounts[m] = (muscleCounts[m] || 0) + (i === 0 ? 2 : 1);
    });
  });
  const muscles = Object.keys(muscleCounts).sort((a, b) => muscleCounts[b] - muscleCounts[a]);

  const categoryCounts = {};
  muscles.forEach(m => {
    const cat = MUSCLE_TO_PPLC[m];
    if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + muscleCounts[m];
  });
  const category = Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a])[0] || 'Push';

  // Which body-diagram view (front/back) best represents this workout.
  // Primary signal: how many exercises' MAIN target muscle lives on each
  // view — e.g. a Pull day is "mostly back" because Barbell Row/Lat
  // Pulldown/Seated Cable Row all target Back first, even though Face Pull
  // and Hammer Curl (front-view primaries) plus every row's secondary Biceps
  // credit add up to the same *total* mention weight as Back alone — a flat
  // score comparison ties here and defaults front, showing a Pull day as a
  // biceps close-up instead of the intended full-back highlight. Counting
  // primary-target exercises instead breaks that tie correctly (3 back vs 2
  // front). Falls back to the aggregate weighted score (secondary movers
  // included) only if even that's tied.
  let primaryFrontCount = 0, primaryBackCount = 0;
  exercises.forEach(ex => {
    const primary = getMuscleGroupsForExercise(ex.name)[0];
    if (MUSCLE_BODY_VIEW[primary] === 'front') primaryFrontCount++;
    else if (MUSCLE_BODY_VIEW[primary] === 'back') primaryBackCount++;
  });
  let view;
  if (primaryFrontCount !== primaryBackCount) {
    view = primaryBackCount > primaryFrontCount ? 'back' : 'front';
  } else {
    let frontScore = 0, backScore = 0;
    muscles.forEach(m => {
      if (MUSCLE_BODY_VIEW[m] === 'front') frontScore += muscleCounts[m];
      else if (MUSCLE_BODY_VIEW[m] === 'back') backScore += muscleCounts[m];
    });
    view = backScore > frontScore ? 'back' : 'front';
  }

  return {
    muscles,
    primaryMuscle: muscles[0] || 'Chest',
    category,
    color: PPLC_COLOR[category] || PPLC_COLOR.Push,
    view,
    exerciseCount,
    totalSets,
    estMinutes: Math.max(15, Math.round((totalSets * 2.5) / 5) * 5)
  };
};
