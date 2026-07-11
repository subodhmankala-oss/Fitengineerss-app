// Shared BMR/TDEE-based macro target calculation, used by both the legacy
// instant-login path (Onboarding.jsx) and the post-signup onboarding wizard.
//
// Calorie formula and macro percentages are calibrated to match
// calculator.net's "Balanced" macro calculator output (verified to the exact
// gram against two independently different real test cases: 65kg/180cm/25yo
// -> 2425/148/323/69, and 93.5kg/170cm/39yo Fat Loss -> 2148/131/286/61).
//
// Two intentional differences from a bit-for-bit match, both explicit
// product choices:
// - Gender isn't a field this app collects. Mifflin-St Jeor's male/female
//   forms differ only in the final constant (+5 male, -161 female); this
//   uses the average of the two (-78) rather than adding a new field.
// - No rounding to "nice" numbers (nearest-50 calories, nearest-5 grams) —
//   values are left at calculator.net's raw precision instead.
export const calculateTargetsGeneric = (wVal, hVal, aVal, actVal, goalVal) => {
  const w = parseFloat(wVal) || 70;
  const h = parseFloat(hVal) || 170;
  const a = parseInt(aVal) || 28;

  const bmr = 10 * w + 6.25 * h - 5 * a - 78;

  // Matches calculator.net's own activity-multiplier values exactly (their
  // 6-tier list collapsed onto this app's existing 4 labels — Sedentary,
  // Lightly Active, and Very Active already coincided with their Sedentary,
  // Light, and Very Active values; only Moderately Active's multiplier
  // (1.55 -> 1.465, their "Moderate") actually changes here).
  let multiplier = 1.2;
  if (actVal === 'Lightly Active') multiplier = 1.375;
  else if (actVal === 'Moderately Active') multiplier = 1.465;
  else if (actVal === 'Very Active') multiplier = 1.725;

  const tdee = bmr * multiplier;

  let calorieTarget = tdee;
  if (goalVal && goalVal.includes('Fat Loss')) {
    calorieTarget = tdee - 500;
    if (calorieTarget < 1200) calorieTarget = 1200;
  } else if (goalVal && goalVal.includes('Muscle Building')) {
    calorieTarget = tdee + 300;
  }
  calorieTarget = Math.round(calorieTarget);

  // Percentages of total calories (not a shared 100% budget — each is its
  // own independent guideline-derived share, same as calculator.net's
  // "Balanced" preset, which is why they don't sum to exactly 100%).
  const proteinGrams = Math.round((calorieTarget * 0.244) / 4);
  const fatGrams = Math.round((calorieTarget * 0.256) / 9);
  const carbGrams = Math.round((calorieTarget * 0.533) / 4);

  return {
    calories: calorieTarget,
    protein: proteinGrams,
    carbs: carbGrams,
    fats: fatGrams
  };
};

// Maps the new wizard's DB enum values to the legacy display labels the rest
// of the app (dashboards, BMR calc above) already branches on.
export const PROGRAM_TO_GOAL_LABEL = {
  fat_loss: 'Fat Loss',
  muscle_building: 'Muscle Building',
  gut_repair: 'Gut Fix'
};

export const ACTIVITY_TO_LABEL = {
  sedentary: 'Sedentary',
  lightly_active: 'Lightly Active',
  moderately_active: 'Moderately Active',
  very_active: 'Very Active'
};

export const CONCERN_TO_LABEL = {
  bloating_constipation: 'Bloating or Constipation',
  digestion_issues: 'Digestion Issues',
  just_stay_fit: 'Just Stay Fit'
};
