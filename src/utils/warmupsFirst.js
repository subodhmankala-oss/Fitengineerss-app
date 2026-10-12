import { isWarmupCardExercise } from './warmupBlocks';

// The session with its warm-up moves (the Warm-up card) first, everything
// else after them, each group keeping its order. Used when a Live Log is
// handed over to the client, so a warm-up added mid-session is still in the
// Warm-up card at the top when they open it.
export function warmupsFirst(exercises) {
  const list = exercises || [];
  const warm = list.filter(isWarmupCardExercise);
  if (warm.length === 0 || warm.length === list.length) return list;
  return [...warm, ...list.filter(ex => !isWarmupCardExercise(ex))];
}
