// This workout's heat scale — sets on a muscle so far today, not the weekly
// target colours of the Muscles tab (that map answers "is my week balanced",
// this one answers "what have I hit right now"). A main muscle gets 1 per
// set and a helper muscle ½ (getMuscleWeight), so one bench set = Chest
// orange, Shoulders/Triceps peach.
export const HEAT_STEPS = [
  { min: 4, color: '#991b1b' },
  { min: 2.5, color: '#dc2626' },
  { min: 1, color: '#f97316' },
  { min: 0.01, color: '#fdba74' },
];
export const heatColor = (sets) => HEAT_STEPS.find(s => sets >= s.min)?.color ?? null;
