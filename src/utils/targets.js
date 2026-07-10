// Shared BMR/TDEE-based macro target calculation, used by both the legacy
// instant-login path (Onboarding.jsx) and the post-signup onboarding wizard.
export const calculateTargetsGeneric = (wVal, hVal, aVal, actVal, goalVal) => {
  const w = parseFloat(wVal) || 70;
  const h = parseFloat(hVal) || 170;
  const a = parseInt(aVal) || 28;

  const bmr = 10 * w + 6.25 * h - 5 * a + 5;

  let multiplier = 1.2;
  if (actVal === 'Lightly Active') multiplier = 1.375;
  else if (actVal === 'Moderately Active') multiplier = 1.55;
  else if (actVal === 'Very Active') multiplier = 1.725;

  const tdee = bmr * multiplier;

  let calorieTarget = Math.round(tdee);
  if (goalVal && goalVal.includes('Fat Loss')) {
    calorieTarget = Math.round(tdee - 500);
    if (calorieTarget < 1200) calorieTarget = 1200;
  } else if (goalVal && goalVal.includes('Muscle Building')) {
    calorieTarget = Math.round(tdee + 300);
  }

  calorieTarget = Math.round(calorieTarget / 50) * 50;

  // Protein is set per kg of bodyweight (sports-nutrition standard), NOT as a
  // percentage of calories. Deriving it from calories made it balloon for light
  // but very-active clients (e.g. a 64 kg client got 215 g ≈ 3.4 g/kg). Goal
  // drives the factor: more protein in a deficit to spare muscle.
  let proteinPerKg = 1.8; // general / maintenance
  if (goalVal && goalVal.includes('Fat Loss')) {
    proteinPerKg = 2.2;
  } else if (goalVal && goalVal.includes('Muscle Building')) {
    proteinPerKg = 2.0;
  }
  // g/kg is meant for lean body mass, but we only have total bodyweight, so it
  // overshoots for heavier/higher-BMI clients (e.g. 93.5kg x 2.2 = 205g — not
  // realistically achievable/necessary). Cap at a sane daily ceiling instead of
  // estimating body fat %, which we don't collect.
  const MAX_PROTEIN_GRAMS = 180;
  const proteinGrams = Math.min(Math.round(w * proteinPerKg), MAX_PROTEIN_GRAMS);

  // Fats take ~27% of calories; carbs fill whatever calories remain after
  // protein and fat. Clamp carbs at 0 so an extreme high-protein/low-calorie
  // combination can never produce a negative number.
  const fatGrams = Math.round((calorieTarget * 0.27) / 9);
  const remainingCals = calorieTarget - proteinGrams * 4 - fatGrams * 9;
  const carbGrams = Math.max(0, Math.round(remainingCals / 4));

  return {
    calories: calorieTarget,
    protein: Math.round(proteinGrams / 5) * 5,
    carbs: Math.round(carbGrams / 5) * 5,
    fats: Math.round(fatGrams / 5) * 5
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
