import { getPlanCardMeta } from './planCardMeta';

// Tags shown on Workout Library program cards and in the program preview.
// Library programs carry no duration or equipment fields, so both are
// derived: time from planCardMeta's estMinutes heuristic, equipment from the
// exercise names.

const EQUIPMENT = [
  ['Dumbbells', /dumbbell|\bdb\b|kettlebell/],
  ['Barbell', /barbell|\bbb\b|smith|\bez\b|bench press|deadlift/],
  ['Machines', /machine|cable|pulldown|pull down|pushdown|push down|leg press|leg extension|leg curl|pec deck|seated row|hack squat|assisted/],
];

// Equipment labels a program needs, in a fixed order; ['No equipment'] when
// none is recognised (bodyweight work).
export function getProgramEquipment(exercises) {
  const names = (exercises || []).map(ex => String(ex?.name || '').toLowerCase());
  const found = EQUIPMENT
    .filter(([label, re]) => names.some(n =>
      re.test(n) &&
      // "Dumbbell Bench Press" is dumbbell work, not barbell.
      !(label === 'Barbell' && EQUIPMENT[0][1].test(n))
    ))
    .map(([label]) => label);
  return found.length ? found : ['No equipment'];
}

export function getProgramTags(exercises, planName) {
  const meta = getPlanCardMeta({ exercises: exercises || [], planName });
  return { minutes: meta.estMinutes, equipment: getProgramEquipment(exercises) };
}

// "3 sets × 10", or "3 sets · 12/10/8" when the reps differ, or "3 sets".
export function formatSets(sets) {
  const list = Array.isArray(sets) ? sets : [];
  if (!list.length) return '';
  const label = `${list.length} set${list.length === 1 ? '' : 's'}`;
  const reps = list.map(s => String(s?.reps ?? '').trim()).filter(Boolean);
  if (reps.length !== list.length) return label;
  return reps.every(r => r === reps[0]) ? `${label} × ${reps[0]}` : `${label} · ${reps.join('/')}`;
}
