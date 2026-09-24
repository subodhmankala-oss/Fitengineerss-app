// Body weight is always STORED in kilograms (clients.weight_kg,
// localStorage userWeight) — every calorie and macro-target formula reads it
// as kg. The client's Units setting (localStorage weightUnit: 'kg' | 'lbs')
// only changes how the Profile weight field shows and accepts the number.

const KG_PER_LB = 0.45359237;

function round(value, decimals) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

// Stored kg -> the text shown in the field for the chosen unit. Empty or
// unparseable input stays empty rather than turning into "0".
export function kgToDisplayWeight(kgValue, unit) {
  const kg = parseFloat(kgValue);
  if (!Number.isFinite(kg)) return '';
  return String(unit === 'lbs' ? round(kg / KG_PER_LB, 1) : kg);
}

// What the client typed in the chosen unit -> kg to store. Pounds convert
// with 2 decimals so 180 lbs -> 81.65 kg shows back as exactly 180 lbs.
export function displayWeightToKg(displayValue, unit) {
  const n = parseFloat(displayValue);
  if (!Number.isFinite(n)) return '';
  return String(unit === 'lbs' ? round(n * KG_PER_LB, 2) : n);
}
