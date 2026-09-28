// Single source of truth for the Hevy-style "Select Set Type" popup used across
// the coach Workout Plan editor, the coach Live Log, and the client Log Sets logger.
export const SET_TYPE_OPTIONS = [
  { type: 'warmup',   badge: 'W', label: 'Warm Up Set',  desc: 'Light prep — not counted toward progress', color: '#f59e0b' },
  { type: 'normal',   badge: '1', label: 'Normal Set',   desc: 'Standard working set',                     color: 'var(--accent-text)' },
  { type: 'failure',  badge: 'F', label: 'Failure Set',  desc: 'Pushed to muscular failure',               color: '#ef4444' },
  { type: 'drop',     badge: 'D', label: 'Drop Set',     desc: 'Drop the weight, keep repping',            color: '#8b5cf6' },
  { type: 'superset', badge: 'S', label: 'Superset',     desc: 'Paired back-to-back with another exercise',color: '#3b82f6' },
];

// Resolve the badge letter + accent colour for a stored set, so the row label
// matches the menu. `workingNum` is the sequential number among normal sets.
export const getSetTypeVisual = (set, workingNum) => {
  if (set.setType === 'failure')  return { label: 'F', color: '#ef4444' };
  if (set.setType === 'drop')     return { label: 'D', color: '#8b5cf6' };
  if (set.setType === 'superset') return { label: 'S', color: '#3b82f6' };
  if (set.isWarmup)               return { label: 'W', color: '#f59e0b' };
  return { label: workingNum, color: null };
};
