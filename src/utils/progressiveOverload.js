// Add Set's weight suggestion for straight/pyramid-style training: keep the
// rep target fixed and bump the load by one standard barbell plate
// increment (2.5kg) each new set, rather than just repeating the last set's
// weight verbatim. Reps are left untouched by the caller — this only
// computes the next weight.
const WEIGHT_STEP_KG = 2.5;

export function suggestNextWeight(lastWeight, fallback = '2.5') {
  const parsed = parseFloat(lastWeight);
  if (!Number.isFinite(parsed)) return fallback;
  const next = Math.round((parsed + WEIGHT_STEP_KG) * 100) / 100;
  return String(next);
}
