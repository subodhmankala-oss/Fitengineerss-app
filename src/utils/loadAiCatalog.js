import databaseService from '../services/databaseService';
import { EXERCISE_LIBRARY, PICKER_HIDDEN_NAMES } from '../data/exerciseLibrary';
import { buildAiCatalog } from './aiWorkoutCatalog';

// The coach's full exercise library for the AI Draft Builder and its Swap
// sheet — the same three sources, precedence and hidden names as the Add
// Exercise picker (ExercisePickerModal's activeLibrary), so the AI can only
// pick what the coach could pick by hand. Every source is best-effort: a
// failed read just leaves that source out.
export async function loadAiCatalog({ coachId = null } = {}) {
  const [dbExercises, deleted, customExercises] = await Promise.all([
    databaseService.getExerciseLibrary().catch(() => []),
    Promise.resolve(databaseService.getHiddenExerciseNames?.()).catch(() => null),
    coachId ? databaseService.getCustomExercisesForViewer({ coachId }).catch(() => []) : Promise.resolve([])
  ]);
  const hidden = new Set([
    ...PICKER_HIDDEN_NAMES.map(n => n.toLowerCase()),
    ...(deleted ? [...deleted] : [])
  ]);
  return buildAiCatalog({
    dbExercises: dbExercises || [],
    customExercises: customExercises || [],
    staticLibrary: EXERCISE_LIBRARY,
    hidden
  });
}
