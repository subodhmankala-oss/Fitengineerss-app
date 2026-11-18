import { parseLocalDateString, shiftLocalDateString, getLocalDateString } from './dateUtils.js';

// Pure (no browser/Supabase imports) so the home card and the Sunday push in
// api/push.js build the same sentence.

const DAY_BY_MUSCLE = {
  Chest: 'push', Shoulders: 'push', Triceps: 'push',
  Back: 'pull', Biceps: 'pull', Forearms: 'pull',
  Quads: 'leg', Glutes: 'leg', Hamstrings: 'leg', Calves: 'leg',
};

// Sunday (YYYY-MM-DD) ending the Mon–Sun week that holds dateStr.
const weekEndOf = (dateStr) => {
  const dow = parseLocalDateString(dateStr).getDay(); // 0 = Sun
  return shiftLocalDateString(dateStr, dow === 0 ? 0 : 7 - dow);
};

/**
 * Parts a self-guided user saved "for next time" that the week didn't get to.
 * Shows from the Sunday their week ends through the following week; nothing
 * before that (the part can still be done).
 * @param muscleOf part → muscle, for items saved without a `muscle`
 * @returns {null | {weekEnd, parts: string[], title, body}}
 */
export function getSelfMissedAlert(items, today = getLocalDateString(), muscleOf = () => null) {
  const from = shiftLocalDateString(today, -7);
  const missed = (items || [])
    .filter(it => it?.nextSession && it.part && it.date)
    .map(it => ({ part: it.part, muscle: it.muscle || muscleOf(it.part), weekEnd: weekEndOf(it.date) }))
    .filter(it => it.weekEnd <= today && it.weekEnd >= from);
  if (!missed.length) return null;
  const weekEnd = missed.reduce((m, it) => (it.weekEnd > m ? it.weekEnd : m), missed[0].weekEnd);
  const mine = missed.filter(it => it.weekEnd === weekEnd);
  const parts = [...new Set(mine.map(it => it.part))];
  const join = (xs, last) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} ${last} ${xs[xs.length - 1]}` : xs[0]);
  const days = [...new Set(mine.map(it => {
    const kind = DAY_BY_MUSCLE[it.muscle];
    return kind ? `${kind} day` : `${(it.muscle || 'training').toLowerCase()} day`;
  }))];
  return {
    weekEnd,
    parts,
    title: `You missed ${join(parts, 'and')} ${weekEnd === today ? 'this week' : 'last week'}`,
    body: `${parts.length > 1 ? "They're" : "It's"} on your next ${join(days, 'or')}.`,
  };
}
