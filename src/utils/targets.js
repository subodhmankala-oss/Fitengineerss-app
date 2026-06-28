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

  let proteinRatio = 0.30;
  let carbsRatio = 0.40;
  let fatsRatio = 0.30;

  if (goalVal && goalVal.includes('Fat Loss')) {
    proteinRatio = 0.35;
    carbsRatio = 0.35;
    fatsRatio = 0.30;
  } else if (goalVal && goalVal.includes('Muscle Building')) {
    proteinRatio = 0.30;
    carbsRatio = 0.45;
    fatsRatio = 0.25;
  }

  const proteinGrams = Math.round((calorieTarget * proteinRatio) / 4);
  const fatGrams = Math.round((calorieTarget * fatsRatio) / 9);
  const carbGrams = Math.round((calorieTarget * carbsRatio) / 4);

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
