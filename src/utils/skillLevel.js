import { idleDecayPoints } from './trainingLevelDecay';

export const SKILL_TIERS = ['Beginner', 'Intermediate', 'Advanced', 'Elite'];

// ─── Skill level: Beginner / Intermediate / Advanced / Elite ───
// A LIFETIME journey, not a recent-activity snapshot — a client who's only
// been training for two weeks cannot reach Advanced/Elite no matter how
// perfect those two weeks were; those tiers have to be earned with real
// calendar time, the same way an actual training journey works. Two parts:
//
//   1. A tenure gate — minimum weeks since their FIRST ever logged session
//      — that caps which tier is reachable at all, regardless of score:
//      Beginner (0-4wk) → Intermediate (4-12wk) → Advanced (12-26wk) →
//      Elite (26wk+).
//   2. A 0-100 score computed from their WHOLE history (not a 30-day/
//      6-session window), which decides where within that tenure-allowed
//      range they actually land — someone eligible for Advanced by tenure
//      but who trains erratically still sits at Beginner/Intermediate.
//      - Consistency (50%): distinct days logged, lifetime, against an
//        expected ~3x/week cadence for however many weeks they've been
//        active. A quiet stretch still pulls this down over time (more
//        weeks active with the same session count = lower rate), it just
//        can't swing the whole score in 30 days the way a rolling window
//        did.
//      - Progressive overload (50%): across their ENTIRE session history,
//        what fraction of exercise-to-exercise comparisons (each exercise
//        vs its own most recent prior occurrence) held steady or went
//        heavier.
//
// Final tier = min(tenure-gate tier, score-based tier) — both have to
// agree; neither alone is enough.
//
// `clientSessions`: one entry per date, oldest first —
// `{ date, exercises: [{ name, sets: [{ weight }] }] }`. This is the single
// source for the Training Level bar (WorkoutTracker) and the Home banner's
// level floor, so the two can never disagree.
export function computeSkillLevel(clientSessions, now = Date.now()) {
  const tiers = SKILL_TIERS;
  if (clientSessions.length === 0) {
    return { score: 0, tier: tiers[0], tierIndex: 0, withinTierPct: 0, decay: 0 };
  }

  const firstDate = new Date(`${clientSessions[0].date}T00:00:00`);
  // Floored to 1 so it's never a divide-by-zero denominator below —
  // `realWeeksActive` (unfloored) is what the marker's own tenure
  // progress is measured against, since flooring THAT to 1 would make a
  // day-one client's marker jump straight to 25% of the way through
  // Beginner before they've trained at all.
  const weeksActive = Math.max(1, (now - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const realWeeksActive = Math.max(0, (now - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000));

  const distinctDays = new Set(clientSessions.map(s => s.date)).size;
  const consistencyPct = Math.min(1, distinctDays / (weeksActive * 3));

  let comparisons = 0;
  let maintainedOrUp = 0;
  clientSessions.forEach((session, idx) => {
    if (idx === 0) return; // nothing earlier to compare against
    (session.exercises || []).forEach(ex => {
      const maxWeight = Math.max(0, ...(ex.sets || []).map(s => parseFloat(s.weight) || 0));
      if (maxWeight <= 0) return; // bodyweight/cardio — no weight to compare
      // Most recent EARLIER session (anywhere in their history) that also
      // logged this exercise with a real weight.
      for (let back = idx - 1; back >= 0; back--) {
        const prevEx = (clientSessions[back].exercises || []).find(e => e.name.toLowerCase() === ex.name.toLowerCase());
        if (!prevEx) continue;
        const prevMax = Math.max(0, ...prevEx.sets.map(s => parseFloat(s.weight) || 0));
        if (prevMax <= 0) break;
        comparisons += 1;
        if (maxWeight >= prevMax) maintainedOrUp += 1;
        break;
      }
    });
  });
  const overloadPct = comparisons > 0 ? maintainedOrUp / comparisons : 0;

  // 1 point off per full week with no workout logged (see
  // utils/trainingLevelDecay — the inactivity push warns on each drop).
  const decay = idleDecayPoints(clientSessions[clientSessions.length - 1].date);
  const score = Math.max(0, consistencyPct * 50 + overloadPct * 50 - decay); // 0–100
  const scoreTierIndex = Math.min(3, Math.floor(score / 25));
  const tenureTierIndex = weeksActive >= 26 ? 3 : weeksActive >= 12 ? 2 : weeksActive >= 4 ? 1 : 0;
  const tierIndex = Math.min(scoreTierIndex, tenureTierIndex);
  // Position within the active tier's own slice, for the marker — driven
  // by whichever of the two axes (score or tenure) is the actual
  // bottleneck holding them at this tier, not always the score one. A
  // tenure-capped client (score would already place them higher) used to
  // show flat at the START of their tier for their entire time in it —
  // weeks of real training with zero visible movement — because the old
  // formula only ever looked at score. Taking the TIGHTER of the two
  // percentages means whichever axis hasn't caught up yet is what's
  // reflected, so a tenure-capped client still sees the marker creep
  // forward as calendar weeks pass, and a score-capped client (tenure
  // already qualifies them higher) still sees it driven by score.
  const TIER_WEEK_BOUNDS = [[0, 4], [4, 12], [12, 26], [26, Infinity]];
  const [bandStart, bandEnd] = TIER_WEEK_BOUNDS[tierIndex];
  const tenureWithinPct = bandEnd === Infinity ? 1 : Math.min(1, Math.max(0, (realWeeksActive - bandStart) / (bandEnd - bandStart)));
  const scoreWithinPct = Math.min(1, Math.max(0, (score - tierIndex * 25) / 25));
  const withinTierPct = Math.min(scoreWithinPct, tenureWithinPct);
  return { score, tier: tiers[tierIndex], tierIndex, withinTierPct, decay };
}
